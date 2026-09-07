/**
 * Stock movements — docs/M1_SPEC.md §4 "Stock" and §6.4.
 *
 * `Material.stockOnHand` changes ONLY through `applyStockMovement()`. The UI never posts signed numbers: it sends a
 * Type plus a positive Quantity, or — for ADJUSTMENT — the counted "New stock on hand"; this module computes the
 * signed delta (RECEIPT / RETURN = +qty, ISSUE = −qty, ADJUSTMENT = counted − current).
 *
 * Atomic write: ONE conditional `updateManyAndReturn` (`stockOnHand >= -delta` whenever the delta is negative) with
 * `increment: delta`. It must affect exactly one row, otherwise `StockWouldGoNegative` ("Only {onHand} {unit} on
 * hand") is thrown and the surrounding transaction rolls back. Two concurrent ISSUEs against a balance that covers
 * only one therefore end with exactly one success (Postgres re-evaluates the WHERE on the locked row). The movement
 * row (with `balanceAfter`) and its CREATE audit entry are written in the SAME transaction.
 *
 * Permissions: RECEIPT / ISSUE / RETURN need `stock:move`; ADJUSTMENT needs `stock:adjust` (SUPERVISOR has the
 * former only). The check is repeated here so it holds even when a caller only guarded `stock:move`.
 */
import type { Material, StockMovement } from "@/generated/prisma/client";
import type { StockMovementType } from "@/generated/prisma/enums";
import { audit, type AuditCtx } from "@/lib/audit";
import type { Session } from "@/lib/auth/session";
import { round3 } from "@/lib/bom";
import type { TenantDb, TenantTx } from "@/lib/db";
import { DomainError, ForbiddenError, NotFoundError } from "@/lib/errors";
import { formatQty, formatSignedQty, toNumberLike } from "@/lib/format";
import { movementTypeLabel } from "@/lib/materials/movement-types";
import { can, type Permission } from "@/lib/rbac";
import { toPlain } from "@/lib/serialize";
import { hasMaxDecimals } from "@/lib/validation/common";
import { movementDelta, NEW_STOCK_MESSAGE, QUANTITY_MESSAGE } from "@/lib/validation/materials";

/** Thrown when a movement would take stock on hand below zero. `message` is user-facing (spec §4). */
export class StockWouldGoNegative extends DomainError {
  readonly onHand: number;
  readonly unit: string;

  constructor(onHand: number, unit: string) {
    super(`Only ${formatQty(onHand, unit)} on hand`, "stock_negative", 409);
    this.onHand = onHand;
    this.unit = unit;
  }
}

/** Thrown when a movement targets an inactive (retired) material. */
export class MaterialInactiveError extends DomainError {
  constructor(code: string) {
    super(`Material ${code} is inactive. Reactivate it before recording stock movements.`, "material_inactive", 409);
  }
}

export type StockMovementRequest = {
  materialId: string;
  type: StockMovementType;
  /** Positive quantity (≤ 3 dp) for RECEIPT / ISSUE / RETURN. */
  quantity?: number;
  /** Counted stock on hand (≥ 0, ≤ 3 dp) for ADJUSTMENT. */
  newStock?: number;
  reference?: string | null;
  note?: string | null;
};

export type StockMovementResult = {
  movement: StockMovement;
  /** The material AFTER the movement (stockOnHand updated). */
  material: Material;
  /** Signed delta applied to stockOnHand (3 dp). */
  delta: number;
  /** Stock on hand after the movement (3 dp). */
  balanceAfter: number;
};

/** The actor and tenant a movement is recorded for — any `Session` satisfies it. */
export type StockActor = {
  user: Pick<Session["user"], "id" | "role" | "email" | "name">;
  tenant: Pick<Session["tenant"], "id">;
};

/** RECEIPT / ISSUE / RETURN → `stock:move`; ADJUSTMENT → `stock:adjust`. */
export function permissionForMovement(type: StockMovementType): Permission {
  return type === "ADJUSTMENT" ? "stock:adjust" : "stock:move";
}

export function canRecordMovement(role: Session["user"]["role"], type: StockMovementType): boolean {
  return can(role, permissionForMovement(type));
}

/** Decimal(14,3) column value as a string so no binary float noise reaches the database. */
function decimal3(n: number): string {
  return round3(n).toFixed(3);
}

function assertRequestShape(input: StockMovementRequest): void {
  if (input.type === "ADJUSTMENT") {
    const counted = input.newStock;
    if (counted === undefined || !Number.isFinite(counted) || counted < 0 || !hasMaxDecimals(counted, 3)) {
      throw new DomainError(NEW_STOCK_MESSAGE, "invalid_quantity");
    }
    return;
  }
  const qty = input.quantity;
  if (qty === undefined || !Number.isFinite(qty) || qty <= 0 || !hasMaxDecimals(qty, 3)) {
    throw new DomainError(QUANTITY_MESSAGE, "invalid_quantity");
  }
}

/**
 * Applies one stock movement inside the caller's transaction (`tx` from `db.$transaction(async tx => …)` on the
 * tenant-scoped client). Throws `ForbiddenError`, `NotFoundError`, `MaterialInactiveError`, `DomainError` (bad
 * quantity) or `StockWouldGoNegative`; every one of them rolls the transaction back.
 */
export async function applyStockMovement(
  tx: TenantTx,
  session: StockActor,
  ctx: AuditCtx,
  input: StockMovementRequest,
): Promise<StockMovementResult> {
  if (!canRecordMovement(session.user.role, input.type)) {
    throw new ForbiddenError(
      input.type === "ADJUSTMENT"
        ? "Stock adjustments need the stock:adjust permission (Admin or Planner)."
        : "You do not have permission to record stock movements.",
    );
  }
  assertRequestShape(input);

  const material = await tx.material.findUnique({ where: { id: input.materialId } });
  if (!material) throw new NotFoundError("Material not found.");
  if (!material.isActive) throw new MaterialInactiveError(material.code);

  const delta = movementDelta(input, material.stockOnHand);

  const updated = await tx.material.updateManyAndReturn({
    where: {
      id: material.id,
      tenantId: material.tenantId,
      ...(delta < 0 ? { stockOnHand: { gte: decimal3(-delta) } } : {}),
    },
    data: { stockOnHand: { increment: decimal3(delta) } },
    select: { stockOnHand: true },
  });
  if (updated.length !== 1) {
    // The guard failed: another transaction consumed the stock first (or the row vanished). Report the balance
    // as it is now, which the statement-level snapshot already reflects.
    const current = await tx.material.findUnique({ where: { id: material.id }, select: { stockOnHand: true } });
    if (!current) throw new NotFoundError("Material not found.");
    throw new StockWouldGoNegative(round3(toNumberLike(current.stockOnHand)), material.unit);
  }

  const balanceAfterDecimal = updated[0].stockOnHand;
  const balanceAfter = round3(toNumberLike(balanceAfterDecimal));

  const movement = await tx.stockMovement.create({
    data: {
      tenantId: session.tenant.id,
      materialId: material.id,
      type: input.type,
      quantity: decimal3(delta),
      balanceAfter: decimal3(balanceAfter),
      reference: input.reference?.trim() || null,
      note: input.note?.trim() || null,
      createdById: session.user.id,
    },
  });

  const label = movementTypeLabel(input.type);
  const signed = formatSignedQty(delta, material.unit);
  await audit(tx, ctx, {
    entityType: "StockMovement",
    entityId: movement.id,
    entityLabel: `${label} ${signed}`,
    action: "CREATE",
    // `after.materialId` lets the material detail page find its movement audit rows with a JSON path filter.
    after: { ...toPlain(movement), materialCode: material.code, unit: material.unit },
    summary: `Material ${material.code}: ${label} ${signed} → ${formatQty(balanceAfter, material.unit)} on hand`,
  });

  return {
    movement,
    material: { ...material, stockOnHand: balanceAfterDecimal },
    delta,
    balanceAfter,
  };
}

/** Convenience wrapper: runs `applyStockMovement()` in its own transaction on the scoped client. */
export function recordStockMovement(
  db: TenantDb,
  session: StockActor,
  ctx: AuditCtx,
  input: StockMovementRequest,
): Promise<StockMovementResult> {
  return db.$transaction((tx) => applyStockMovement(tx, session, ctx, input));
}
