/**
 * Material master mutations (docs/M1_SPEC.md §4 "Delete vs deactivate", "Audit contract"; §6.4).
 * Every mutation runs in ONE `db.$transaction` on the tenant-scoped client with its audit row in the same
 * transaction. Stock on hand is never touched here — that is `applyStockMovement()` in src/lib/stock.ts.
 */
import type { Material } from "@/generated/prisma/client";
import { audit, type AuditCtx } from "@/lib/audit";
import type { TenantDb, TenantTx } from "@/lib/db";
import { DomainError, NotFoundError } from "@/lib/errors";
import { OPEN_STATUSES } from "@/lib/orders/kpis";
import type { StockActor } from "@/lib/stock";
import { toPlain } from "@/lib/serialize";
import type { MaterialInput } from "@/lib/validation/materials";

export class MaterialCodeTakenError extends DomainError {
  readonly code: string;

  constructor(code: string) {
    super(`Material code ${code} already exists`, "material_code_taken", 409);
    this.code = code;
  }
}

/** Where a material is referenced. Any BOM line or stock movement blocks a hard delete (NoAction FKs). */
export type MaterialReferences = {
  bomItems: number;
  movements: number;
  /** Open orders whose product BOM uses the material (informational — orders reference products, not materials). */
  openOrders: number;
};

export class MaterialInUseError extends DomainError {
  readonly references: MaterialReferences;

  constructor(code: string, references: MaterialReferences) {
    super(
      `${code} cannot be deleted: ${describeReferences(references)}. Deactivate it instead.`,
      "material_in_use",
      409,
    );
    this.references = references;
  }
}

function plural(n: number, singular: string, pluralForm = `${singular}s`): string {
  return `${n} ${n === 1 ? singular : pluralForm}`;
}

/** "used by 3 BOM lines (2 open orders) and 12 stock movements" */
export function describeReferences(refs: MaterialReferences): string {
  const parts: string[] = [];
  if (refs.bomItems > 0) {
    const orders = refs.openOrders > 0 ? ` (${plural(refs.openOrders, "open order")})` : "";
    parts.push(`${plural(refs.bomItems, "BOM line")}${orders}`);
  }
  if (refs.movements > 0) parts.push(plural(refs.movements, "stock movement"));
  return parts.length ? `used by ${parts.join(" and ")}` : "not referenced anywhere";
}

export function isDeletable(refs: MaterialReferences): boolean {
  return refs.bomItems === 0 && refs.movements === 0;
}

export async function materialReferences(db: TenantDb | TenantTx, materialId: string): Promise<MaterialReferences> {
  const [bomItems, movements, openOrders] = await Promise.all([
    db.bomItem.count({ where: { materialId } }),
    db.stockMovement.count({ where: { materialId } }),
    db.order.count({
      where: { status: { in: [...OPEN_STATUSES] }, product: { bomItems: { some: { materialId } } } },
    }),
  ]);
  return { bomItems, movements, openOrders };
}

/** Audit snapshot: the master-data fields a user can edit (stock on hand is audited through movements). */
function snapshot(m: Material) {
  const p = toPlain(m);
  return {
    code: p.code,
    name: p.name,
    unit: p.unit,
    reorderThreshold: p.reorderThreshold,
    reorderLeadTimeDays: p.reorderLeadTimeDays,
    unitCost: p.unitCost,
    supplier: p.supplier,
    isActive: p.isActive,
  };
}

function normalise(input: MaterialInput) {
  return {
    code: input.code.trim(),
    name: input.name.trim(),
    unit: input.unit,
    reorderThreshold: input.reorderThreshold.toFixed(3),
    reorderLeadTimeDays: input.reorderLeadTimeDays,
    unitCost: input.unitCost === undefined ? null : input.unitCost.toFixed(2),
    supplier: input.supplier?.trim() || null,
  };
}

/** Case-insensitive duplicate-code check so `rm-1` and `RM-1` cannot coexist. */
async function assertCodeFree(tx: TenantTx, code: string, exceptId?: string): Promise<void> {
  const clash = await tx.material.findFirst({
    where: { code: { equals: code, mode: "insensitive" }, ...(exceptId ? { NOT: { id: exceptId } } : {}) },
    select: { code: true },
  });
  if (clash) throw new MaterialCodeTakenError(clash.code);
}

export async function createMaterial(
  db: TenantDb,
  session: StockActor,
  ctx: AuditCtx,
  input: MaterialInput,
): Promise<Material> {
  const data = normalise(input);
  return db.$transaction(async (tx) => {
    await assertCodeFree(tx, data.code);
    const material = await tx.material.create({
      data: { tenantId: session.tenant.id, ...data, isActive: input.isActive ?? true },
    });
    await audit(tx, ctx, {
      entityType: "Material",
      entityId: material.id,
      entityLabel: material.code,
      action: "CREATE",
      after: snapshot(material),
      summary: `Material ${material.code} (${material.name}) created`,
    });
    return material;
  });
}

export async function updateMaterial(
  db: TenantDb,
  _session: StockActor,
  ctx: AuditCtx,
  materialId: string,
  input: MaterialInput,
): Promise<Material> {
  const data = normalise(input);
  return db.$transaction(async (tx) => {
    const before = await tx.material.findUnique({ where: { id: materialId } });
    if (!before) throw new NotFoundError("Material not found.");
    await assertCodeFree(tx, data.code, materialId);
    const after = await tx.material.update({
      where: { id: materialId },
      data: { ...data, ...(input.isActive === undefined ? {} : { isActive: input.isActive }) },
    });
    await audit(tx, ctx, {
      entityType: "Material",
      entityId: after.id,
      entityLabel: after.code,
      action: "UPDATE",
      before: snapshot(before),
      after: snapshot(after),
      summary: `Material ${after.code} updated`,
    });
    return after;
  });
}

/** Deactivate (`isActive=false`, hidden from pickers) or reactivate. Idempotent; still audited when unchanged. */
export async function setMaterialActive(
  db: TenantDb,
  _session: StockActor,
  ctx: AuditCtx,
  materialId: string,
  isActive: boolean,
): Promise<Material> {
  return db.$transaction(async (tx) => {
    const before = await tx.material.findUnique({ where: { id: materialId } });
    if (!before) throw new NotFoundError("Material not found.");
    const after = await tx.material.update({ where: { id: materialId }, data: { isActive } });
    await audit(tx, ctx, {
      entityType: "Material",
      entityId: after.id,
      entityLabel: after.code,
      action: "UPDATE",
      before: snapshot(before),
      after: snapshot(after),
      summary: `Material ${after.code} ${isActive ? "reactivated" : "deactivated"}`,
    });
    return after;
  });
}

/**
 * Hard delete — only when nothing references the material (checked inside the transaction; the NoAction FKs are
 * the backstop). Materials with any stock movement are never deleted (spec §4).
 */
export async function deleteMaterial(
  db: TenantDb,
  _session: StockActor,
  ctx: AuditCtx,
  materialId: string,
): Promise<Material> {
  return db.$transaction(async (tx) => {
    const before = await tx.material.findUnique({ where: { id: materialId } });
    if (!before) throw new NotFoundError("Material not found.");
    const refs = await materialReferences(tx, materialId);
    if (!isDeletable(refs)) throw new MaterialInUseError(before.code, refs);
    await tx.material.delete({ where: { id: materialId } });
    await audit(tx, ctx, {
      entityType: "Material",
      entityId: before.id,
      entityLabel: before.code,
      action: "DELETE",
      before: snapshot(before),
      summary: `Material ${before.code} (${before.name}) deleted`,
    });
    return before;
  });
}
