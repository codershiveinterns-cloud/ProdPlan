/**
 * Integration: automatic / manual order numbers (docs/M1_SPEC.md §4 "Orders") — reservation from Tenant.orderSeq,
 * upper-casing of manual numbers, duplicate detection, and the P2002 retry rule around the create transaction.
 */
import { z } from "zod";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Session } from "@/lib/auth/guards";
import { prisma } from "@/lib/db";
import { reserveOrderNumbers, withOrderNumberRetry } from "@/lib/orders/reserve";
import { createOrder } from "@/lib/orders/service";
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

describe.skipIf(!available)("order numbers (integration)", () => {
  let f: TenantFixture;
  let session: Session;
  let productId: string;
  let customerId: string;
  const TODAY = "2030-01-01";

  const baseInput = () =>
    createOrderSchema(TODAY).parse({
      customer: customerId,
      productId,
      quantity: "10",
      dueDate: "2030-02-01",
      priority: "",
      orderNumber: "",
    });

  beforeAll(async () => {
    f = await createTenantFixture({ slugPrefix: "ord-num" });
    session = sessionFor(f);
    const product = await prisma.product.create({ data: { tenantId: f.tenant.id, sku: "HB-200", name: "Bracket", unit: "pcs" } });
    const customer = await prisma.customer.create({ data: { tenantId: f.tenant.id, name: "Bharat Motors" } });
    productId = product.id;
    customerId = customer.id;
  });

  afterAll(async () => {
    await deleteTenant(f?.tenant.id);
    await disconnectDb();
  });

  it("reserveOrderNumbers bumps Tenant.orderSeq by n and returns SO-%06d numbers", async () => {
    await f.db.$transaction(async (tx) => {
      expect(await reserveOrderNumbers(tx, f.tenant.id, 0)).toEqual([]);
      expect(await reserveOrderNumbers(tx, f.tenant.id, 3)).toEqual(["SO-000001", "SO-000002", "SO-000003"]);
      expect(await reserveOrderNumbers(tx, f.tenant.id, 1)).toEqual(["SO-000004"]);
    });
    const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: f.tenant.id } });
    expect(tenant.orderSeq).toBe(4);
    await expect(reserveOrderNumbers(f.db, f.tenant.id, -1)).rejects.toBeInstanceOf(RangeError);
  });

  it("createOrder without a number takes the next automatic one and audits CREATE", async () => {
    const order = await createOrder(f.db, session, baseInput());
    expect(order.orderNumber).toBe("SO-000005");
    expect(order.status).toBe("QUEUED");
    expect(order.tenantId).toBe(f.tenant.id);
    const next = await createOrder(f.db, session, baseInput());
    expect(next.orderNumber).toBe("SO-000006");
    const audits = await prisma.auditLog.findMany({ where: { tenantId: f.tenant.id, entityType: "Order", action: "CREATE" } });
    expect(audits.map((a) => a.entityLabel).sort()).toEqual(["SO-000005", "SO-000006"]);
    expect(audits[0]!.actorUserId).toBe(f.admin.id);
    expect(audits[0]!.summary).toMatch(/^Order SO-00000\d created$/);
  });

  it("manual numbers are trimmed + upper-cased and do not consume the sequence", async () => {
    const input = createOrderSchema(TODAY).parse({ ...baseInput(), customer: customerId, orderNumber: "  cust/2026-001 " });
    const order = await createOrder(f.db, session, input);
    expect(order.orderNumber).toBe("CUST/2026-001");
    const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: f.tenant.id } });
    expect(tenant.orderSeq).toBe(6);
  });

  it("a duplicate manual number is reported on the orderNumber field", async () => {
    const input = createOrderSchema(TODAY).parse({ ...baseInput(), customer: customerId, orderNumber: "cust/2026-001" });
    let caught: unknown;
    try {
      await createOrder(f.db, session, input);
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(z.ZodError);
    expect(z.flattenError(caught as z.ZodError).fieldErrors).toEqual({ orderNumber: ["Order CUST/2026-001 already exists"] });
  });

  it("the reserved SO-%06d pattern is rejected before reaching the database", () => {
    const r = createOrderSchema(TODAY).safeParse({ ...baseInput(), customer: customerId, orderNumber: "SO-000123" });
    expect(r.success).toBe(false);
  });

  it("skips automatic numbers that already exist (inserted outside the sequence) instead of failing", async () => {
    // Someone inserted the next automatic number directly (seed/migration): the first reservation collides.
    await prisma.order.create({
      data: {
        tenantId: f.tenant.id,
        orderNumber: "SO-000007",
        customerId,
        productId,
        quantity: 1,
        dueDate: new Date("2030-02-01T00:00:00.000Z"),
        createdById: f.admin.id,
      },
    });
    let attempts = 0;
    const order = await withOrderNumberRetry(async () => {
      attempts++;
      return createOrder(f.db, session, baseInput());
    });
    // The reservation detects the collision inside the transaction, so no P2002 ever reaches the wrapper.
    expect(attempts).toBe(1);
    expect(order.orderNumber).toBe("SO-000008");
    const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: f.tenant.id } });
    expect(tenant.orderSeq).toBe(8);

    // A block reservation keeps the free numbers and tops up the colliding slots.
    await prisma.order.create({
      data: { tenantId: f.tenant.id, orderNumber: "SO-000010", customerId, productId, quantity: 1, dueDate: new Date("2030-02-01T00:00:00.000Z"), createdById: f.admin.id },
    });
    const block = await f.db.$transaction((tx) => reserveOrderNumbers(tx, f.tenant.id, 3));
    expect(block).toEqual(["SO-000009", "SO-000011", "SO-000012"]);
    expect((await prisma.tenant.findUniqueOrThrow({ where: { id: f.tenant.id } })).orderSeq).toBe(12);
  });

  it("withOrderNumberRetry gives up after 5 attempts and rethrows non-conflict errors immediately", async () => {
    const conflict = Object.assign(new Error("dup"), {
      code: "P2002",
      meta: { driverAdapterError: { cause: { constraint: { index: "Order_tenantId_orderNumber_key" }, table: "Order" } } },
    });
    let n = 0;
    await expect(
      withOrderNumberRetry(async () => {
        n++;
        throw conflict;
      }),
    ).rejects.toBe(conflict);
    expect(n).toBe(5);
    let m = 0;
    await expect(
      withOrderNumberRetry(async () => {
        m++;
        throw new Error("other");
      }),
    ).rejects.toThrow("other");
    expect(m).toBe(1);
  });
});
