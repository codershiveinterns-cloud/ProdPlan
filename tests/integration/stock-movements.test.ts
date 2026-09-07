/**
 * Integration: `applyStockMovement()` (docs/M1_SPEC.md §4 "Stock", §8 "stock concurrency").
 * Runs against TEST_DATABASE_URL; skips with a warning when the database is unreachable.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import bcrypt from "bcryptjs";
import type { Material, User } from "@/generated/prisma/client";
import type { Role } from "@/generated/prisma/enums";
import type { AuditCtx } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { DomainError, ForbiddenError, NotFoundError } from "@/lib/errors";
import {
  applyStockMovement,
  canRecordMovement,
  MaterialInactiveError,
  permissionForMovement,
  recordStockMovement,
  StockWouldGoNegative,
  type StockActor,
} from "@/lib/stock";
import { createTenantFixture, dbAvailable, deleteTenant, disconnectDb, type TenantFixture } from "./helpers";

const available = await dbAvailable();

function actorFor(user: Pick<User, "id" | "role" | "email" | "name">, tenantId: string): StockActor {
  return { user: { id: user.id, role: user.role, email: user.email, name: user.name }, tenant: { id: tenantId } };
}

function ctxFor(actor: StockActor): AuditCtx {
  return {
    actor: { id: actor.user.id, email: actor.user.email, name: actor.user.name, tenantId: actor.tenant.id },
    ip: "127.0.0.1",
    userAgent: "vitest",
  };
}

async function createUser(tenantId: string, role: Role, slug: string): Promise<User> {
  return prisma.user.create({
    data: {
      tenantId,
      email: `${role.toLowerCase()}@${slug}.test`,
      name: `${role} User`,
      passwordHash: await bcrypt.hash("Password123!", 4),
      role,
    },
  });
}

async function onHand(materialId: string): Promise<number> {
  const row = await prisma.material.findUniqueOrThrow({ where: { id: materialId }, select: { stockOnHand: true } });
  return Number(String(row.stockOnHand));
}

describe.skipIf(!available)("stock movements (integration)", () => {
  let T: TenantFixture;
  let admin: StockActor;
  let supervisor: StockActor;
  let viewer: StockActor;
  let material: Material;

  beforeAll(async () => {
    T = await createTenantFixture({ slugPrefix: "stock" });
    const [sup, view] = await Promise.all([
      createUser(T.tenant.id, "SUPERVISOR", T.tenant.slug),
      createUser(T.tenant.id, "VIEWER", T.tenant.slug),
    ]);
    admin = actorFor(T.admin, T.tenant.id);
    supervisor = actorFor(sup, T.tenant.id);
    viewer = actorFor(view, T.tenant.id);
    material = await prisma.material.create({
      data: { tenantId: T.tenant.id, code: "RM-AL6061-BAR", name: "Aluminium bar", unit: "kg", reorderThreshold: 20 },
    });
  });

  afterAll(async () => {
    await deleteTenant(T?.tenant.id);
    await disconnectDb();
  });

  it("maps movement types to permissions", () => {
    expect(permissionForMovement("RECEIPT")).toBe("stock:move");
    expect(permissionForMovement("ISSUE")).toBe("stock:move");
    expect(permissionForMovement("RETURN")).toBe("stock:move");
    expect(permissionForMovement("ADJUSTMENT")).toBe("stock:adjust");
    expect(canRecordMovement("SUPERVISOR", "ISSUE")).toBe(true);
    expect(canRecordMovement("SUPERVISOR", "ADJUSTMENT")).toBe(false);
    expect(canRecordMovement("VIEWER", "RECEIPT")).toBe(false);
    expect(canRecordMovement("PLANNER", "ADJUSTMENT")).toBe(true);
  });

  it("RECEIPT adds to stock and writes the movement + audit row in the same transaction", async () => {
    const result = await T.db.$transaction((tx) =>
      applyStockMovement(tx, admin, ctxFor(admin), {
        materialId: material.id,
        type: "RECEIPT",
        quantity: 100,
        reference: "GRN-001",
        note: "  First delivery  ",
      }),
    );
    expect(result.delta).toBe(100);
    expect(result.balanceAfter).toBe(100);
    expect(String(result.movement.quantity)).toBe("100");
    expect(String(result.movement.balanceAfter)).toBe("100");
    expect(result.movement).toMatchObject({
      tenantId: T.tenant.id,
      materialId: material.id,
      type: "RECEIPT",
      reference: "GRN-001",
      note: "First delivery",
      createdById: T.admin.id,
    });
    expect(String(result.material.stockOnHand)).toBe("100");
    expect(await onHand(material.id)).toBe(100);

    const audit = await prisma.auditLog.findFirst({
      where: { tenantId: T.tenant.id, entityType: "StockMovement", entityId: result.movement.id },
    });
    expect(audit).toMatchObject({
      action: "CREATE",
      actorUserId: T.admin.id,
      actorEmail: T.admin.email,
      entityLabel: "Receipt +100 kg",
      summary: "Material RM-AL6061-BAR: Receipt +100 kg → 100 kg on hand",
    });
    expect(audit?.after).toMatchObject({ materialId: material.id, quantity: 100, balanceAfter: 100, materialCode: "RM-AL6061-BAR" });
  });

  it("ISSUE removes from stock (signed delta, balanceAfter)", async () => {
    const result = await recordStockMovement(T.db, admin, ctxFor(admin), {
      materialId: material.id,
      type: "ISSUE",
      quantity: 30,
      reference: "SO-000001",
    });
    expect(result.delta).toBe(-30);
    expect(String(result.movement.quantity)).toBe("-30");
    expect(result.balanceAfter).toBe(70);
    expect(await onHand(material.id)).toBe(70);
  });

  it("RETURN adds back to stock", async () => {
    const result = await recordStockMovement(T.db, admin, ctxFor(admin), { materialId: material.id, type: "RETURN", quantity: 5.25 });
    expect(result.delta).toBe(5.25);
    expect(result.balanceAfter).toBe(75.25);
    expect(await onHand(material.id)).toBe(75.25);
  });

  it("ADJUSTMENT records counted − current as the delta", async () => {
    const down = await recordStockMovement(T.db, admin, ctxFor(admin), { materialId: material.id, type: "ADJUSTMENT", newStock: 60 });
    expect(down.delta).toBe(-15.25);
    expect(String(down.movement.quantity)).toBe("-15.25");
    expect(down.balanceAfter).toBe(60);
    expect(await onHand(material.id)).toBe(60);

    const up = await recordStockMovement(T.db, admin, ctxFor(admin), { materialId: material.id, type: "ADJUSTMENT", newStock: 100.5 });
    expect(up.delta).toBe(40.5);
    expect(up.balanceAfter).toBe(100.5);

    const same = await recordStockMovement(T.db, admin, ctxFor(admin), { materialId: material.id, type: "ADJUSTMENT", newStock: 100.5 });
    expect(same.delta).toBe(0);
    expect(same.balanceAfter).toBe(100.5);

    const zero = await recordStockMovement(T.db, admin, ctxFor(admin), { materialId: material.id, type: "ADJUSTMENT", newStock: 0 });
    expect(zero.delta).toBe(-100.5);
    expect(await onHand(material.id)).toBe(0);
  });

  it("keeps 3-dp precision (no binary float noise)", async () => {
    await recordStockMovement(T.db, admin, ctxFor(admin), { materialId: material.id, type: "RECEIPT", quantity: 0.1 });
    const r = await recordStockMovement(T.db, admin, ctxFor(admin), { materialId: material.id, type: "RECEIPT", quantity: 0.2 });
    expect(r.balanceAfter).toBe(0.3);
    expect(String(r.movement.balanceAfter)).toBe("0.3");
    await recordStockMovement(T.db, admin, ctxFor(admin), { materialId: material.id, type: "ADJUSTMENT", newStock: 60 });
    expect(await onHand(material.id)).toBe(60);
  });

  it("negative guard: an ISSUE larger than the balance throws StockWouldGoNegative and rolls everything back", async () => {
    const before = await prisma.stockMovement.count({ where: { materialId: material.id } });
    const auditBefore = await prisma.auditLog.count({ where: { tenantId: T.tenant.id, entityType: "StockMovement" } });

    const attempt = recordStockMovement(T.db, admin, ctxFor(admin), { materialId: material.id, type: "ISSUE", quantity: 60.001 });
    await expect(attempt).rejects.toBeInstanceOf(StockWouldGoNegative);
    await expect(attempt).rejects.toMatchObject({ message: "Only 60 kg on hand", onHand: 60, unit: "kg", code: "stock_negative" });

    expect(await onHand(material.id)).toBe(60);
    expect(await prisma.stockMovement.count({ where: { materialId: material.id } })).toBe(before);
    expect(await prisma.auditLog.count({ where: { tenantId: T.tenant.id, entityType: "StockMovement" } })).toBe(auditBefore);

    // Issuing exactly the balance is allowed (stock reaches 0, never below).
    const exact = await recordStockMovement(T.db, admin, ctxFor(admin), { materialId: material.id, type: "ISSUE", quantity: 60 });
    expect(exact.balanceAfter).toBe(0);
    await expect(
      recordStockMovement(T.db, admin, ctxFor(admin), { materialId: material.id, type: "ISSUE", quantity: 0.001 }),
    ).rejects.toMatchObject({ message: "Only 0 kg on hand" });
  });

  it("two concurrent ISSUEs against a balance covering only one: exactly one succeeds", async () => {
    await recordStockMovement(T.db, admin, ctxFor(admin), { materialId: material.id, type: "ADJUSTMENT", newStock: 100 });
    const movementsBefore = await prisma.stockMovement.count({ where: { materialId: material.id } });

    const issue = () =>
      recordStockMovement(T.db, admin, ctxFor(admin), { materialId: material.id, type: "ISSUE", quantity: 60 });
    const results = await Promise.allSettled([issue(), issue()]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toBeInstanceOf(StockWouldGoNegative);
    expect((rejected[0].reason as StockWouldGoNegative).message).toBe("Only 40 kg on hand");

    expect(await onHand(material.id)).toBe(40);
    expect(await prisma.stockMovement.count({ where: { materialId: material.id } })).toBe(movementsBefore + 1);
  });

  it("SUPERVISOR may record RECEIPT/ISSUE/RETURN but not ADJUSTMENT; VIEWER may record nothing", async () => {
    const ok = await recordStockMovement(T.db, supervisor, ctxFor(supervisor), { materialId: material.id, type: "ISSUE", quantity: 10 });
    expect(ok.balanceAfter).toBe(30);
    expect(ok.movement.createdById).toBe(supervisor.user.id);

    const before = await onHand(material.id);
    await expect(
      recordStockMovement(T.db, supervisor, ctxFor(supervisor), { materialId: material.id, type: "ADJUSTMENT", newStock: 500 }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      recordStockMovement(T.db, viewer, ctxFor(viewer), { materialId: material.id, type: "RECEIPT", quantity: 1 }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(await onHand(material.id)).toBe(before);
  });

  it("rejects malformed requests before touching the database", async () => {
    const before = await onHand(material.id);
    const bad = [
      { materialId: material.id, type: "ISSUE" as const },
      { materialId: material.id, type: "ISSUE" as const, quantity: 0 },
      { materialId: material.id, type: "RECEIPT" as const, quantity: -1 },
      { materialId: material.id, type: "RECEIPT" as const, quantity: 1.2345 },
      { materialId: material.id, type: "ADJUSTMENT" as const },
      { materialId: material.id, type: "ADJUSTMENT" as const, newStock: -0.001 },
    ];
    for (const input of bad) {
      await expect(recordStockMovement(T.db, admin, ctxFor(admin), input)).rejects.toBeInstanceOf(DomainError);
    }
    expect(await onHand(material.id)).toBe(before);
  });

  it("refuses unknown, other-tenant and inactive materials", async () => {
    await expect(
      recordStockMovement(T.db, admin, ctxFor(admin), { materialId: "does-not-exist", type: "RECEIPT", quantity: 1 }),
    ).rejects.toBeInstanceOf(NotFoundError);

    const other = await createTenantFixture({ slugPrefix: "stock-other" });
    try {
      const foreign = await prisma.material.create({ data: { tenantId: other.tenant.id, code: "RM-X", name: "Foreign", unit: "kg" } });
      await expect(
        recordStockMovement(T.db, admin, ctxFor(admin), { materialId: foreign.id, type: "RECEIPT", quantity: 1 }),
      ).rejects.toBeInstanceOf(NotFoundError);
    } finally {
      await deleteTenant(other.tenant.id);
    }

    const retired = await prisma.material.create({
      data: { tenantId: T.tenant.id, code: "RM-RETIRED", name: "Retired", unit: "pcs", isActive: false },
    });
    await expect(
      recordStockMovement(T.db, admin, ctxFor(admin), { materialId: retired.id, type: "RECEIPT", quantity: 1 }),
    ).rejects.toBeInstanceOf(MaterialInactiveError);
  });
});
