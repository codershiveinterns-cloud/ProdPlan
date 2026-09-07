/**
 * Integration: routing rules (docs/M1_SPEC.md §4 "Routing") — sequences 10/20/30, move up/down through the
 * two-phase renumber without violating `[tenantId, productId, sequence]`, remove renumbers, the optional fixed
 * machine must belong to the selected work center and must not be retired, and every change is audited.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Machine, Product, WorkCenter } from "@/generated/prisma/client";
import type { Session } from "@/lib/auth/guards";
import { prisma, type TenantDb } from "@/lib/db";
import { MACHINE_INACTIVE_MESSAGE, MACHINE_WORK_CENTER_MESSAGE, ProductFieldError } from "@/lib/products/errors";
import { addOperation, createProduct, moveOperation, removeOperation, updateOperation } from "@/lib/products/mutations";
import { getProductDetail, listRoutingOptions } from "@/lib/products/queries";
import { createTenantFixture, dbAvailable, deleteTenant, disconnectDb, type TenantFixture } from "./helpers";
import { seedMachine, seedWorkCenter, sessionFor } from "./products-helpers";

const available = await dbAvailable();

async function sequencesOf(productId: string): Promise<Array<[string, number]>> {
  const rows = await prisma.productOperation.findMany({ where: { productId }, orderBy: { sequence: "asc" }, include: { workCenter: true } });
  return rows.map((r) => [r.workCenter.code, r.sequence]);
}

describe.skipIf(!available)("products: routing (integration)", () => {
  let fx: TenantFixture;
  let db: TenantDb;
  let session: Session;
  let product: Product;
  let cnc: WorkCenter;
  let assembly: WorkCenter;
  let paint: WorkCenter;
  let cnc1: Machine;
  let asm1: Machine;
  let cncRetired: Machine;

  beforeAll(async () => {
    fx = await createTenantFixture({ slugPrefix: "prod-routing" });
    db = fx.db;
    session = sessionFor(fx);
    product = await createProduct(db, session, { sku: "GX-40", name: "Gearbox Housing", unit: "pcs", description: undefined, isActive: undefined });
    [cnc, assembly, paint] = await Promise.all([
      seedWorkCenter(fx.tenant.id, "CNC"),
      seedWorkCenter(fx.tenant.id, "ASM"),
      seedWorkCenter(fx.tenant.id, "PNT"),
    ]);
    [cnc1, asm1, cncRetired] = await Promise.all([
      seedMachine(fx.tenant.id, cnc.id, fx.calendar.id, "CNC-1"),
      seedMachine(fx.tenant.id, assembly.id, fx.calendar.id, "ASM-1", "MAINTENANCE"),
      seedMachine(fx.tenant.id, cnc.id, fx.calendar.id, "CNC-OLD", "INACTIVE"),
    ]);
  });

  afterAll(async () => {
    await deleteTenant(fx?.tenant.id);
    await disconnectDb();
  });

  it("assigns sequences 10, 20, 30 automatically", async () => {
    const op1 = await addOperation(db, session, { productId: product.id, workCenterId: cnc.id, machineId: cnc1.id, setupMinutes: 30, runMinutesPerUnit: 2.5 });
    const op2 = await addOperation(db, session, { productId: product.id, workCenterId: assembly.id, machineId: undefined, setupMinutes: 10, runMinutesPerUnit: 4 });
    const op3 = await addOperation(db, session, { productId: product.id, workCenterId: paint.id, machineId: undefined, setupMinutes: 0, runMinutesPerUnit: 1.25 });
    expect([op1.sequence, op2.sequence, op3.sequence]).toEqual([10, 20, 30]);
    expect(op1.machineId).toBe(cnc1.id);
    expect(op2.machineId).toBeNull();
    expect(await sequencesOf(product.id)).toEqual([["CNC", 10], ["ASM", 20], ["PNT", 30]]);

    const creates = await prisma.auditLog.findMany({ where: { tenantId: fx.tenant.id, entityType: "ProductOperation", action: "CREATE" } });
    expect(creates).toHaveLength(3);
    expect(creates.map((r) => r.entityLabel).sort()).toEqual(["GX-40 · 10 CNC", "GX-40 · 20 ASM", "GX-40 · 30 PNT"]);
  });

  it("rejects a machine from another work center, a retired machine, and a foreign machine", async () => {
    await expect(
      addOperation(db, session, { productId: product.id, workCenterId: cnc.id, machineId: asm1.id, setupMinutes: 0, runMinutesPerUnit: 1 }),
    ).rejects.toMatchObject({ field: "machineId", message: MACHINE_WORK_CENTER_MESSAGE });
    await expect(
      addOperation(db, session, { productId: product.id, workCenterId: cnc.id, machineId: cncRetired.id, setupMinutes: 0, runMinutesPerUnit: 1 }),
    ).rejects.toMatchObject({ field: "machineId", message: MACHINE_INACTIVE_MESSAGE });

    const other = await createTenantFixture({ slugPrefix: "prod-routing-other" });
    try {
      const foreignWc = await seedWorkCenter(other.tenant.id, "CNC");
      const foreignMachine = await seedMachine(other.tenant.id, foreignWc.id, other.calendar.id, "CNC-1");
      await expect(
        addOperation(db, session, { productId: product.id, workCenterId: cnc.id, machineId: foreignMachine.id, setupMinutes: 0, runMinutesPerUnit: 1 }),
      ).rejects.toMatchObject({ field: "machineId", message: "Select a machine" });
      await expect(
        addOperation(db, session, { productId: product.id, workCenterId: foreignWc.id, machineId: undefined, setupMinutes: 0, runMinutesPerUnit: 1 }),
      ).rejects.toMatchObject({ field: "workCenterId", message: "Select a work center" });
    } finally {
      await deleteTenant(other.tenant.id);
    }
    // Nothing leaked into the routing.
    expect(await sequencesOf(product.id)).toEqual([["CNC", 10], ["ASM", 20], ["PNT", 30]]);
    expect(await prisma.productOperation.count({ where: { productId: product.id } })).toBe(3);
  });

  it("offers only non-retired machines in the picker (plus referenced ones)", async () => {
    const { workCenters, machines } = await listRoutingOptions(db);
    expect(workCenters.map((w) => w.code)).toEqual(["ASM", "CNC", "PNT"]);
    expect(machines.map((m) => m.code).sort()).toEqual(["ASM-1", "CNC-1"]);
    const kept = await listRoutingOptions(db, [cncRetired.id]);
    expect(kept.machines.map((m) => m.code).sort()).toEqual(["ASM-1", "CNC-1", "CNC-OLD"]);
  });

  it("moves a step up and down through negative temporaries and keeps 10/20/30", async () => {
    const ops = await prisma.productOperation.findMany({ where: { productId: product.id } });
    const paintOp = ops.find((o) => o.workCenterId === paint.id)!;

    expect(await moveOperation(db, session, { productId: product.id, operationId: paintOp.id, direction: "up" })).toEqual({ moved: true });
    expect(await sequencesOf(product.id)).toEqual([["CNC", 10], ["PNT", 20], ["ASM", 30]]);

    expect(await moveOperation(db, session, { productId: product.id, operationId: paintOp.id, direction: "up" })).toEqual({ moved: true });
    expect(await sequencesOf(product.id)).toEqual([["PNT", 10], ["CNC", 20], ["ASM", 30]]);

    // Already first: no-op, nothing written, nothing audited.
    const auditBefore = await prisma.auditLog.count({ where: { tenantId: fx.tenant.id } });
    expect(await moveOperation(db, session, { productId: product.id, operationId: paintOp.id, direction: "up" })).toEqual({ moved: false });
    expect(await sequencesOf(product.id)).toEqual([["PNT", 10], ["CNC", 20], ["ASM", 30]]);
    expect(await prisma.auditLog.count({ where: { tenantId: fx.tenant.id } })).toBe(auditBefore);

    expect(await moveOperation(db, session, { productId: product.id, operationId: paintOp.id, direction: "down" })).toEqual({ moved: true });
    expect(await moveOperation(db, session, { productId: product.id, operationId: paintOp.id, direction: "down" })).toEqual({ moved: true });
    expect(await sequencesOf(product.id)).toEqual([["CNC", 10], ["ASM", 20], ["PNT", 30]]);
    expect(await moveOperation(db, session, { productId: product.id, operationId: paintOp.id, direction: "down" })).toEqual({ moved: false });

    // No negative temporaries survive and every sequence is a multiple of 10.
    const all = await prisma.productOperation.findMany({ where: { productId: product.id } });
    expect(all.every((o) => o.sequence > 0 && o.sequence % 10 === 0)).toBe(true);
    expect(new Set(all.map((o) => o.sequence)).size).toBe(all.length);

    const moves = await prisma.auditLog.findMany({ where: { entityId: paintOp.id, action: "UPDATE" }, orderBy: { createdAt: "asc" } });
    expect(moves).toHaveLength(4);
    expect(moves[0].before).toMatchObject({ sequence: 30 });
    expect(moves[0].after).toMatchObject({ sequence: 20 });
    expect(moves[0].changedFields).toEqual(["sequence"]);
  });

  it("survives irregular stored sequences (5, 7, 100) — renumber normalises them", async () => {
    const rows = await prisma.productOperation.findMany({ where: { productId: product.id }, orderBy: { sequence: "asc" } });
    // Break the invariant directly in the DB, then move the last step up.
    await prisma.$transaction([
      prisma.productOperation.update({ where: { id: rows[0].id }, data: { sequence: 5 } }),
      prisma.productOperation.update({ where: { id: rows[1].id }, data: { sequence: 7 } }),
      prisma.productOperation.update({ where: { id: rows[2].id }, data: { sequence: 100 } }),
    ]);
    await moveOperation(db, session, { productId: product.id, operationId: rows[2].id, direction: "up" });
    expect(await sequencesOf(product.id)).toEqual([["CNC", 10], ["PNT", 20], ["ASM", 30]]);
    await moveOperation(db, session, { productId: product.id, operationId: rows[2].id, direction: "down" });
    expect(await sequencesOf(product.id)).toEqual([["CNC", 10], ["ASM", 20], ["PNT", 30]]);
  });

  it("edits a step (work center + machine re-validated) and audits the diff", async () => {
    const asmOp = await prisma.productOperation.findFirstOrThrow({ where: { productId: product.id, workCenterId: assembly.id } });
    await expect(
      updateOperation(db, session, asmOp.id, { productId: product.id, workCenterId: assembly.id, machineId: cnc1.id, setupMinutes: 10, runMinutesPerUnit: 4 }),
    ).rejects.toBeInstanceOf(ProductFieldError);

    const after = await updateOperation(db, session, asmOp.id, {
      productId: product.id,
      workCenterId: assembly.id,
      machineId: asm1.id,
      setupMinutes: 15,
      runMinutesPerUnit: 4,
    });
    expect(after.machineId).toBe(asm1.id);
    expect(after.setupMinutes).toBe(15);
    expect(after.sequence).toBe(20);
    const row = await prisma.auditLog.findFirstOrThrow({ where: { entityId: asmOp.id, action: "UPDATE" }, orderBy: { createdAt: "desc" } });
    expect(row.changedFields.sort()).toEqual(["machineId", "setupMinutes"]);

    // Operation for a different product id is not found.
    const other = await createProduct(db, session, { sku: "OTHER-1", name: "Other", unit: "pcs", description: undefined, isActive: undefined });
    await expect(
      updateOperation(db, session, asmOp.id, { productId: other.id, workCenterId: assembly.id, machineId: undefined, setupMinutes: 1, runMinutesPerUnit: 1 }),
    ).rejects.toMatchObject({ code: "not_found" });
  });

  it("removing a middle step renumbers the rest and a new step is appended at 30", async () => {
    const asmOp = await prisma.productOperation.findFirstOrThrow({ where: { productId: product.id, workCenterId: assembly.id } });
    await removeOperation(db, session, asmOp.id);
    expect(await sequencesOf(product.id)).toEqual([["CNC", 10], ["PNT", 20]]);
    const del = await prisma.auditLog.findFirstOrThrow({ where: { entityId: asmOp.id, action: "DELETE" } });
    expect(del.before).toMatchObject({ productId: product.id, workCenterId: assembly.id, sequence: 20 });

    const op = await addOperation(db, session, { productId: product.id, workCenterId: assembly.id, machineId: undefined, setupMinutes: 5, runMinutesPerUnit: 3 });
    expect(op.sequence).toBe(30);
    const detail = await getProductDetail(db, product.id);
    expect(detail!.operations.map((o) => [o.sequence, o.workCenterCode, o.machineCode])).toEqual([
      [10, "CNC", "CNC-1"],
      [20, "PNT", null],
      [30, "ASM", null],
    ]);
    expect(detail!.operations[0].runMinutesPerUnit).toBe(2.5);
  });
});
