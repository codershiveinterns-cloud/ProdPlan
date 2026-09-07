/**
 * Integration: edit locks (docs/M1_SPEC.md §4 "Orders") — everything editable while QUEUED; customer / product /
 * order number locked once started; only notes in a terminal state. Unchanged locked values are accepted.
 */
import { z } from "zod";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Session } from "@/lib/auth/guards";
import { prisma } from "@/lib/db";
import { DomainError } from "@/lib/errors";
import { editOrderFormSchema } from "@/lib/orders/forms";
import { changeOrderStatus, createOrder, updateOrder } from "@/lib/orders/service";
import { createOrderSchema } from "@/lib/validation/orders";
import { createTenantFixture, dbAvailable, deleteTenant, disconnectDb, type TenantFixture } from "./helpers";

const available = await dbAvailable();

function sessionFor(f: TenantFixture): Session {
  return {
    user: {
      id: f.admin.id,
      tenantId: f.tenant.id,
      email: f.admin.email,
      name: f.admin.name,
      role: "ADMIN",
      isActive: true,
      mustChangePassword: false,
      lastLoginAt: null,
      createdAt: f.admin.createdAt,
      updatedAt: f.admin.updatedAt,
    },
    tenant: { id: f.tenant.id, name: f.tenant.name, slug: f.tenant.slug, timezone: f.tenant.timezone, defaultCalendarId: f.tenant.defaultCalendarId },
  };
}

describe.skipIf(!available)("order edit locks (integration)", () => {
  let f: TenantFixture;
  let session: Session;
  let productA: string;
  let productB: string;
  let customerA: string;
  let customerB: string;

  async function newOrder(): Promise<{ id: string; orderNumber: string }> {
    const input = createOrderSchema("2030-01-01").parse({ customer: customerA, productId: productA, quantity: "5", dueDate: "2030-03-01" });
    const o = await createOrder(f.db, session, input);
    return { id: o.id, orderNumber: o.orderNumber };
  }

  beforeAll(async () => {
    f = await createTenantFixture({ slugPrefix: "ord-lock" });
    session = sessionFor(f);
    productA = (await prisma.product.create({ data: { tenantId: f.tenant.id, sku: "A-1", name: "A" } })).id;
    productB = (await prisma.product.create({ data: { tenantId: f.tenant.id, sku: "B-1", name: "B" } })).id;
    customerA = (await prisma.customer.create({ data: { tenantId: f.tenant.id, name: "Alpha" } })).id;
    customerB = (await prisma.customer.create({ data: { tenantId: f.tenant.id, name: "Beta" } })).id;
  });

  afterAll(async () => {
    await deleteTenant(f?.tenant.id);
    await disconnectDb();
  });

  it("QUEUED: every field is editable, including a new customer created inline, and UPDATE is audited", async () => {
    const { id } = await newOrder();
    const updated = await updateOrder(f.db, session, id, {
      customer: { create: "Gamma Industries" },
      productId: productB,
      orderNumber: "cust-77",
      quantity: 12.5,
      priority: "URGENT",
      dueDate: "2029-12-31",
      earliestStartDate: "2029-12-01",
      customerPoRef: "PO-1",
      notes: "rush",
    });
    expect(updated).toMatchObject({ productId: productB, orderNumber: "CUST-77", priority: "URGENT", customerPoRef: "PO-1", notes: "rush" });
    expect(Number(String(updated.quantity))).toBe(12.5);
    const gamma = await prisma.customer.findFirstOrThrow({ where: { tenantId: f.tenant.id, name: "Gamma Industries" } });
    expect(updated.customerId).toBe(gamma.id);
    const audit = await prisma.auditLog.findFirstOrThrow({ where: { entityId: id, action: "UPDATE" } });
    expect(audit.changedFields.sort()).toEqual(["customerId", "customerPoRef", "dueDate", "earliestStartDate", "notes", "orderNumber", "priority", "productId", "quantity"]);
    expect(await prisma.auditLog.count({ where: { tenantId: f.tenant.id, entityType: "Customer", entityId: gamma.id, action: "CREATE" } })).toBe(1);
  });

  it("IN_PROGRESS: customer, product and order number are locked; other fields still change", async () => {
    const { id, orderNumber } = await newOrder();
    await changeOrderStatus(f.db, session, { orderId: id, status: "IN_PROGRESS" });

    await expect(updateOrder(f.db, session, id, { productId: productB })).rejects.toBeInstanceOf(DomainError);
    await expect(updateOrder(f.db, session, id, { customer: { id: customerB } })).rejects.toBeInstanceOf(DomainError);
    await expect(updateOrder(f.db, session, id, { customer: { create: "Someone New" } })).rejects.toBeInstanceOf(DomainError);
    await expect(updateOrder(f.db, session, id, { orderNumber: "OTHER-1" })).rejects.toBeInstanceOf(DomainError);

    // Re-submitting the unchanged locked values (what the edit form does) is fine.
    const same = await updateOrder(f.db, session, id, { customer: { id: customerA }, productId: productA, orderNumber, quantity: 7, priority: "HIGH", dueDate: "2020-01-01" });
    expect(Number(String(same.quantity))).toBe(7);
    expect(same.priority).toBe("HIGH");
    expect(same.dueDate.toISOString().slice(0, 10)).toBe("2020-01-01");
    expect(same.productId).toBe(productA);
  });

  it("terminal: only notes can change", async () => {
    const { id } = await newOrder();
    await changeOrderStatus(f.db, session, { orderId: id, status: "CANCELLED" });
    await expect(updateOrder(f.db, session, id, { quantity: 99 })).rejects.toBeInstanceOf(DomainError);
    await expect(updateOrder(f.db, session, id, { priority: "LOW" })).rejects.toBeInstanceOf(DomainError);
    await expect(updateOrder(f.db, session, id, { dueDate: "2031-01-01" })).rejects.toBeInstanceOf(DomainError);
    const noted = await updateOrder(f.db, session, id, { notes: "cancelled by customer" });
    expect(noted.notes).toBe("cancelled by customer");
    expect(Number(String(noted.quantity))).toBe(5);
  });

  it("a duplicate order number on edit is reported on the orderNumber field", async () => {
    const a = await newOrder();
    const b = await newOrder();
    let caught: unknown;
    try {
      await updateOrder(f.db, session, b.id, { orderNumber: a.orderNumber });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(z.ZodError);
    expect(z.flattenError(caught as z.ZodError).fieldErrors).toEqual({ orderNumber: [`Order ${a.orderNumber} already exists`] });
  });

  it("editOrderFormSchema keeps an unchanged automatic number but validates a changed one", () => {
    const schema = editOrderFormSchema("SO-000123");
    const base = { customer: customerA, productId: productA, quantity: "1", dueDate: "2030-01-01", priority: "NORMAL" };
    expect(schema.parse({ ...base, orderNumber: "SO-000123" }).orderNumber).toBe("SO-000123");
    expect(schema.parse({ ...base, orderNumber: "" }).orderNumber).toBeUndefined();
    expect(schema.parse({ ...base, orderNumber: " abc-1 " }).orderNumber).toBe("ABC-1");
    const bad = schema.safeParse({ ...base, orderNumber: "SO-000999" });
    expect(bad.success).toBe(false);
    if (!bad.success) expect(z.flattenError(bad.error).fieldErrors.orderNumber?.[0]).toMatch(/reserved/);
  });
});
