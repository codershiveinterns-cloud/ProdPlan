/**
 * Integration: customers (docs/M1_SPEC.md §4 "Customers", §6.7) — case-insensitive matching / uniqueness with the
 * typed casing preserved, delete blocked while orders exist (→ deactivate), list KPIs (open orders, next due).
 */
import { z } from "zod";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Session } from "@/lib/auth/guards";
import {
  createCustomer,
  deleteCustomer,
  findCustomersByNames,
  findOrCreateCustomer,
  listCustomers,
  parseCustomerListParams,
  setCustomerActive,
  updateCustomer,
} from "@/lib/customers";
import { prisma } from "@/lib/db";
import { DomainError } from "@/lib/errors";
import { customerSchema } from "@/lib/validation/customers";
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

describe.skipIf(!available)("customers (integration)", () => {
  let f: TenantFixture;
  let session: Session;

  beforeAll(async () => {
    f = await createTenantFixture({ slugPrefix: "cust" });
    session = sessionFor(f);
  });

  afterAll(async () => {
    await deleteTenant(f?.tenant.id);
    await disconnectDb();
  });

  it("findOrCreateCustomer matches case-insensitively and keeps the typed casing on create", async () => {
    const first = await f.db.$transaction((tx) => findOrCreateCustomer(tx, "  Acme   Motors "));
    expect(first.created).toBe(true);
    expect(first.customer.name).toBe("Acme Motors");
    expect(first.customer.tenantId).toBe(f.tenant.id);

    const again = await f.db.$transaction((tx) => findOrCreateCustomer(tx, "ACME motors"));
    expect(again.created).toBe(false);
    expect(again.customer.id).toBe(first.customer.id);
    expect(again.customer.name).toBe("Acme Motors");
    expect(await prisma.customer.count({ where: { tenantId: f.tenant.id } })).toBe(1);

    await expect(f.db.$transaction((tx) => findOrCreateCustomer(tx, "   "))).rejects.toBeInstanceOf(DomainError);

    const map = await findCustomersByNames(f.db, ["acme MOTORS", "Nobody", "Acme Motors"]);
    expect([...map.keys()]).toEqual(["acme motors"]);
    expect(map.get("acme motors")!.id).toBe(first.customer.id);
  });

  it("the same name in another tenant is a different customer", async () => {
    const other = await createTenantFixture({ slugPrefix: "cust-b" });
    try {
      const r = await other.db.$transaction((tx) => findOrCreateCustomer(tx, "acme motors"));
      expect(r.created).toBe(true);
      expect(r.customer.tenantId).toBe(other.tenant.id);
    } finally {
      await deleteTenant(other.tenant.id);
    }
  });

  it("createCustomer / updateCustomer enforce case-insensitive uniqueness on the name field and audit", async () => {
    let caught: unknown;
    try {
      await createCustomer(f.db, session, customerSchema.parse({ name: "acme motors" }));
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(z.ZodError);
    expect(z.flattenError(caught as z.ZodError).fieldErrors).toEqual({ name: ['A customer named "Acme Motors" already exists'] });

    const beta = await createCustomer(f.db, session, customerSchema.parse({ name: "Beta  Fabrication", code: "BF", email: " Ops@Beta.test " }));
    expect(beta.name).toBe("Beta Fabrication");
    expect(beta.email).toBe("ops@beta.test");
    expect(await prisma.auditLog.count({ where: { entityType: "Customer", entityId: beta.id, action: "CREATE" } })).toBe(1);

    await expect(updateCustomer(f.db, session, beta.id, customerSchema.parse({ name: "ACME MOTORS" }))).rejects.toBeInstanceOf(z.ZodError);
    const renamed = await updateCustomer(f.db, session, beta.id, customerSchema.parse({ name: "beta fabrication", phone: "+91 98765 43210", isActive: "true" }));
    expect(renamed.name).toBe("beta fabrication");
    const audit = await prisma.auditLog.findFirstOrThrow({ where: { entityType: "Customer", entityId: beta.id, action: "UPDATE" } });
    expect(audit.changedFields.sort()).toEqual(["code", "email", "name", "phone"]);
  });

  it("delete is blocked while orders exist; deactivate works and hides the customer from listCustomers by default", async () => {
    const acme = await prisma.customer.findFirstOrThrow({ where: { tenantId: f.tenant.id, name: "Acme Motors" } });
    const product = await prisma.product.create({ data: { tenantId: f.tenant.id, sku: "P-1", name: "P" } });
    await prisma.order.createMany({
      data: [
        { tenantId: f.tenant.id, orderNumber: "A-1", customerId: acme.id, productId: product.id, quantity: 1, dueDate: new Date("2030-02-01T00:00:00.000Z"), createdById: f.admin.id },
        { tenantId: f.tenant.id, orderNumber: "A-2", customerId: acme.id, productId: product.id, quantity: 1, dueDate: new Date("2030-01-15T00:00:00.000Z"), createdById: f.admin.id, status: "IN_PROGRESS" },
        { tenantId: f.tenant.id, orderNumber: "A-3", customerId: acme.id, productId: product.id, quantity: 1, dueDate: new Date("2029-01-01T00:00:00.000Z"), createdById: f.admin.id, status: "COMPLETED" },
      ],
    });
    await expect(deleteCustomer(f.db, session, acme.id)).rejects.toMatchObject({ code: "in_use" });
    expect(await prisma.customer.count({ where: { id: acme.id } })).toBe(1);

    const list = await listCustomers(f.db, parseCustomerListParams({}));
    const row = list.rows.find((r) => r.id === acme.id)!;
    expect(row.openOrders).toBe(2);
    expect(row.nextDue).toBe("2030-01-15");

    const off = await setCustomerActive(f.db, session, acme.id, false);
    expect(off.isActive).toBe(false);
    expect((await listCustomers(f.db, parseCustomerListParams({}))).rows.map((r) => r.id)).not.toContain(acme.id);
    expect((await listCustomers(f.db, parseCustomerListParams({ includeInactive: "1" }))).rows.map((r) => r.id)).toContain(acme.id);
    expect((await listCustomers(f.db, parseCustomerListParams({ q: "acme", includeInactive: "1" }))).total).toBe(1);
    expect((await listCustomers(f.db, parseCustomerListParams({ q: "zzz" }))).total).toBe(0);

    // An unreferenced customer can be hard-deleted (with a DELETE audit row).
    const temp = await createCustomer(f.db, session, customerSchema.parse({ name: "Temporary Co" }));
    await deleteCustomer(f.db, session, temp.id);
    expect(await prisma.customer.count({ where: { id: temp.id } })).toBe(0);
    expect(await prisma.auditLog.count({ where: { entityType: "Customer", entityId: temp.id, action: "DELETE" } })).toBe(1);
    await expect(deleteCustomer(f.db, session, temp.id)).rejects.toMatchObject({ code: "not_found" });
  });
});
