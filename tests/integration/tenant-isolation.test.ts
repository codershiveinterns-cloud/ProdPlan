/**
 * Integration: tenantDb(A) can never see or touch tenant B's rows (docs/M1_SPEC.md §2, last bullet).
 * Runs against TEST_DATABASE_URL; skips with a warning when the database is unreachable.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Prisma, type Customer, type Material, type Product } from "@/generated/prisma/client";
import { audit } from "@/lib/audit";
import { prisma, TenantScopeError, type TenantDb, type TenantTx } from "@/lib/db";
import { createTenantFixture, dbAvailable, deleteTenant, disconnectDb, type TenantFixture } from "./helpers";

const available = await dbAvailable();

describe.skipIf(!available)("tenant isolation (integration)", () => {
  let A: TenantFixture;
  let B: TenantFixture;
  let dbA: TenantDb;
  let productA: Product;
  let productB: Product;
  let materialA: Material;
  let materialB: Material;
  let customerB: Customer;

  beforeAll(async () => {
    [A, B] = await Promise.all([createTenantFixture({ slugPrefix: "iso-a" }), createTenantFixture({ slugPrefix: "iso-b" })]);
    dbA = A.db;
    [productA, productB, materialA, materialB, customerB] = await Promise.all([
      prisma.product.create({ data: { tenantId: A.tenant.id, sku: "HB-200", name: "Bracket A" } }),
      prisma.product.create({ data: { tenantId: B.tenant.id, sku: "HB-200", name: "Bracket B" } }),
      prisma.material.create({ data: { tenantId: A.tenant.id, code: "RM-1", name: "Steel A", unit: "kg" } }),
      prisma.material.create({ data: { tenantId: B.tenant.id, code: "RM-1", name: "Steel B", unit: "kg" } }),
      prisma.customer.create({ data: { tenantId: B.tenant.id, name: "Only in B" } }),
    ]);
  });

  afterAll(async () => {
    await deleteTenant(A?.tenant.id);
    await deleteTenant(B?.tenant.id);
    await disconnectDb();
  });

  it("list/aggregate ops only see A rows", async () => {
    const products = await dbA.product.findMany({ where: { sku: "HB-200" } });
    expect(products.map((p) => p.id)).toEqual([productA.id]);
    expect(await dbA.product.findFirst({ where: { id: productB.id } })).toBeNull();
    expect(await dbA.product.count()).toBe(1);
    expect(await dbA.customer.count()).toBe(0);
    expect(await dbA.customer.findMany()).toEqual([]);
    const agg = await dbA.material.aggregate({ _count: true, where: { code: "RM-1" } });
    expect(agg._count).toBe(1);
    const grouped = await dbA.product.groupBy({ by: ["sku"], _count: { _all: true } });
    expect(grouped).toEqual([{ sku: "HB-200", _count: { _all: 1 } }]);
    await expect(dbA.product.findFirstOrThrow({ where: { id: productB.id } })).rejects.toMatchObject({ code: "P2025" });
  });

  it("unique reads of a B id return null / P2025", async () => {
    expect(await dbA.product.findUnique({ where: { id: productB.id } })).toBeNull();
    expect(await dbA.customer.findUnique({ where: { id: customerB.id } })).toBeNull();
    await expect(dbA.product.findUniqueOrThrow({ where: { id: productB.id } })).rejects.toMatchObject({ code: "P2025" });
    // Compound unique with the wrong tenant is neutralised by the appended scope.
    expect(await dbA.material.findUnique({ where: { tenantId_code: { tenantId: B.tenant.id, code: "RM-1" } } })).toBeNull();
    const own = await dbA.material.findUnique({ where: { tenantId_code: { tenantId: A.tenant.id, code: "RM-1" } } });
    expect(own?.id).toBe(materialA.id);
  });

  it("update/delete ops against B rows fail or affect zero rows", async () => {
    await expect(dbA.product.update({ where: { id: productB.id }, data: { name: "hacked" } })).rejects.toMatchObject({ code: "P2025" });
    expect(await dbA.product.updateMany({ where: { id: productB.id }, data: { name: "hacked" } })).toEqual({ count: 0 });
    expect(await dbA.product.updateManyAndReturn({ where: { sku: "HB-200" }, data: { description: "touched" } })).toHaveLength(1);
    await expect(dbA.customer.delete({ where: { id: customerB.id } })).rejects.toMatchObject({ code: "P2025" });
    expect(await dbA.customer.deleteMany({ where: { id: customerB.id } })).toEqual({ count: 0 });
    expect(await dbA.customer.deleteMany({})).toEqual({ count: 0 });

    const untouched = await prisma.product.findUniqueOrThrow({ where: { id: productB.id } });
    expect(untouched.name).toBe("Bracket B");
    expect(untouched.description).toBeNull();
    expect(await prisma.customer.count({ where: { tenantId: B.tenant.id } })).toBe(1);
  });

  it("update({ data: { tenantId: B } }) leaves the row in A", async () => {
    const updated = await dbA.product.update({ where: { id: productA.id }, data: { tenantId: B.tenant.id, name: "Renamed A" } });
    expect(updated.tenantId).toBe(A.tenant.id);
    const raw = await prisma.product.findUniqueOrThrow({ where: { id: productA.id } });
    expect(raw).toMatchObject({ tenantId: A.tenant.id, name: "Renamed A" });
  });

  it("create forces tenantId to A even when data says B", async () => {
    const created = await dbA.customer.create({ data: { tenantId: B.tenant.id, name: "Forced into A" } });
    expect(created.tenantId).toBe(A.tenant.id);
    expect(await prisma.customer.count({ where: { tenantId: B.tenant.id } })).toBe(1);
  });

  it("createMany / createManyAndReturn rows carry A", async () => {
    const rows = await dbA.workCenter.createManyAndReturn({
      data: [
        { tenantId: B.tenant.id, code: "WC-1", name: "CNC" },
        { tenantId: "garbage", code: "WC-2", name: "Assembly" },
      ],
    });
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.tenantId === A.tenant.id)).toBe(true);
    const many = await dbA.workCenter.createMany({ data: [{ tenantId: B.tenant.id, code: "WC-3", name: "Paint" }] });
    expect(many.count).toBe(1);
    expect(await prisma.workCenter.count({ where: { tenantId: B.tenant.id } })).toBe(0);
    expect(await prisma.workCenter.count({ where: { tenantId: A.tenant.id } })).toBe(3);
  });

  it("upsert is scoped on both paths", async () => {
    const updated = await dbA.material.upsert({
      where: { tenantId_code: { tenantId: A.tenant.id, code: "RM-1" } },
      create: { tenantId: A.tenant.id, code: "RM-1", name: "never", unit: "kg" },
      update: { name: "Steel A (upserted)" },
    });
    expect(updated.id).toBe(materialA.id);
    // A B id is "not found" in A, so the create path runs — and the row lands in A.
    const created = await dbA.material.upsert({
      where: { id: materialB.id },
      create: { tenantId: B.tenant.id, code: "RM-2", name: "Created via upsert", unit: "kg" },
      update: { name: "must not happen" },
    });
    expect(created.tenantId).toBe(A.tenant.id);
    expect(created.id).not.toBe(materialB.id);
    expect((await prisma.material.findUniqueOrThrow({ where: { id: materialB.id } })).name).toBe("Steel B");
  });

  it("tenant.findUnique for B returns null; tenant.update is pinned to A and cannot change id/slug", async () => {
    expect(await dbA.tenant.findUnique({ where: { id: B.tenant.id } })).toBeNull();
    expect((await dbA.tenant.findUnique({ where: { id: A.tenant.id } }))?.id).toBe(A.tenant.id);
    expect((await dbA.tenant.findMany()).map((t) => t.id)).toEqual([A.tenant.id]);
    expect(await dbA.tenant.count()).toBe(1);

    const bumped = await dbA.tenant.update({
      where: { id: A.tenant.id },
      data: { orderSeq: { increment: 5 }, slug: "hijack", id: "hijack" },
      select: { id: true, slug: true, orderSeq: true },
    });
    expect(bumped).toEqual({ id: A.tenant.id, slug: A.tenant.slug, orderSeq: 5 });
    await expect(dbA.tenant.update({ where: { id: B.tenant.id }, data: { name: "hacked" } })).rejects.toMatchObject({ code: "P2025" });
    expect((await prisma.tenant.findUniqueOrThrow({ where: { id: B.tenant.id } })).name).toBe(B.tenant.name);
  });

  it("a nested bomItems.create referencing a B material fails at the DB (composite FK)", async () => {
    await expect(
      dbA.product.update({
        where: { id: productA.id },
        data: { bomItems: { create: { materialId: materialB.id, quantityPerUnit: 1 } } },
      }),
    ).rejects.toMatchObject({ code: "P2003" });
    // …while the same shape with an A material works and inherits A's tenantId.
    const withBom = await dbA.product.update({
      where: { id: productA.id },
      data: { bomItems: { create: { materialId: materialA.id, quantityPerUnit: 1.5 } } },
      include: { bomItems: true },
    });
    expect(withBom.bomItems).toHaveLength(1);
    expect(withBom.bomItems[0].tenantId).toBe(A.tenant.id);
  });

  it("the tx client inside $transaction is still scoped", async () => {
    await dbA.$transaction(async (tx) => {
      const scopedTx: TenantTx = tx;
      expect(scopedTx.$tenantId).toBe(A.tenant.id);
      expect(await tx.product.count()).toBe(1);
      expect(await tx.product.findUnique({ where: { id: productB.id } })).toBeNull();
      expect(await tx.tenant.findUnique({ where: { id: B.tenant.id } })).toBeNull();
      const c = await tx.customer.create({ data: { tenantId: B.tenant.id, name: "Created in tx" } });
      expect(c.tenantId).toBe(A.tenant.id);
      expect(await tx.customer.updateMany({ where: { id: customerB.id }, data: { name: "x" } })).toEqual({ count: 0 });
    });
    expect(await prisma.customer.count({ where: { tenantId: B.tenant.id } })).toBe(1);
  });

  it("audit() writes a scoped row through the transaction client", async () => {
    await dbA.$transaction(async (tx) => {
      await audit(
        tx,
        { actor: { id: A.admin.id, email: A.admin.email, name: A.admin.name }, ip: "203.0.113.5", userAgent: "vitest" },
        {
          entityType: "Product",
          entityId: productA.id,
          entityLabel: "HB-200",
          action: "UPDATE",
          before: { name: "Bracket A", passwordHash: "must-not-persist", quantity: new Prisma.Decimal("1.5") },
          after: { name: "Renamed A", quantity: new Prisma.Decimal("1.5") },
          summary: "Product HB-200 updated",
        },
      );
    });
    const row = await prisma.auditLog.findFirstOrThrow({ where: { entityId: productA.id, action: "UPDATE" } });
    expect(row).toMatchObject({
      tenantId: A.tenant.id,
      actorUserId: A.admin.id,
      actorEmail: A.admin.email,
      ip: "203.0.113.5",
      changedFields: ["name"],
      before: { name: "Bracket A", quantity: 1.5 },
      after: { name: "Renamed A", quantity: 1.5 },
    });
    expect(await dbA.auditLog.count()).toBe(1);
    expect(await B.db.auditLog.count()).toBe(0);
  });

  it("append-only, no-delete and default-deny rules hold at runtime", async () => {
    await expect(dbA.auditLog.deleteMany({})).rejects.toBeInstanceOf(TenantScopeError);
    await expect(dbA.auditLog.updateMany({ data: { summary: "x" } })).rejects.toBeInstanceOf(TenantScopeError);
    await expect(dbA.stockMovement.deleteMany({})).rejects.toBeInstanceOf(TenantScopeError);
    await expect(dbA.user.delete({ where: { id: A.admin.id } })).rejects.toBeInstanceOf(TenantScopeError);
    await expect(dbA.user.deleteMany({})).rejects.toBeInstanceOf(TenantScopeError);
    await expect(dbA.rateLimitBucket.findMany()).rejects.toBeInstanceOf(TenantScopeError);
    await expect(dbA.tenant.delete({ where: { id: A.tenant.id } })).rejects.toBeInstanceOf(TenantScopeError);
    await expect(dbA.tenant.create({ data: { name: "x", slug: `x-${Date.now()}` } })).rejects.toBeInstanceOf(TenantScopeError);
    expect(await prisma.user.count({ where: { tenantId: A.tenant.id } })).toBe(1);
    expect(await prisma.tenant.count({ where: { id: { in: [A.tenant.id, B.tenant.id] } } })).toBe(2);
  });

  it("raw SQL helpers throw on the scoped client and its tx", async () => {
    expect(() => dbA.$queryRaw()).toThrow(TenantScopeError);
    expect(() => dbA.$executeRawUnsafe()).toThrow(TenantScopeError);
    await dbA.$transaction(async (tx) => {
      expect(() => tx.$queryRaw()).toThrow(TenantScopeError);
    });
  });

  it("relation verbs are rejected before reaching the database", async () => {
    await expect(
      dbA.product.update({ where: { id: productA.id }, data: { tenant: { connect: { id: B.tenant.id } } } }),
    ).rejects.toBeInstanceOf(TenantScopeError);
    await expect(
      dbA.bomItem.create({
        data: {
          tenantId: A.tenant.id,
          productId: productA.id,
          quantityPerUnit: 1,
          // A relation-style write is rejected even though Prisma would accept it.
          material: { connect: { id: materialB.id } },
        } as never,
      }),
    ).rejects.toBeInstanceOf(TenantScopeError);
  });
});
