/**
 * Write side of the products module (docs/M1_SPEC.md §4 "BOM maths" / "Routing" / "Delete vs deactivate",
 * §6.5). Every mutation runs inside `db.$transaction(async tx => …)` on the tenant-scoped client and writes its
 * AuditLog row through the same `tx` (spec §4 "Audit contract").
 *
 * Business rules enforced here (integration-tested in tests/integration/products-*.test.ts):
 *  - SKU is unique per tenant, compared case-insensitively (CSV import matches SKUs case-insensitively).
 *  - A material appears at most once per BOM → `ProductFieldError("materialId", "Already in this BOM")`.
 *  - BOM materials must be active tenant materials.
 *  - Routing `sequence` is stored as 10, 20, 30 …; add / remove / move run `renumberOperations()` in the same
 *    transaction using `planRenumber()`'s two-phase plan (negative temporaries, then finals) so the unique
 *    constraint `[tenantId, productId, sequence]` is never violated mid-way.
 *  - An optional fixed machine must belong to the selected work center and must not be retired (INACTIVE).
 *  - Hard delete is refused while orders reference the product (`DomainError`) — the UI offers Deactivate.
 */
import type { BomItem, Product, ProductOperation } from "@/generated/prisma/client";
import { audit, auditContext } from "@/lib/audit";
import type { Session } from "@/lib/auth/guards";
import type { TenantDb, TenantTx } from "@/lib/db";
import { DomainError, NotFoundError } from "@/lib/errors";
import { formatQty } from "@/lib/format";
import { isPrismaKnownError } from "@/lib/action";
import { canMove, nextSequence, planRenumber, type MoveDirection } from "@/lib/routing";
import type { BomItemInput, MoveOperationInput, ProductInput, ProductOperationInput } from "@/lib/validation/products";
import {
  BOM_DUPLICATE_MESSAGE,
  MACHINE_INACTIVE_MESSAGE,
  MACHINE_WORK_CENTER_MESSAGE,
  ProductFieldError,
} from "./errors";

// ---------------------------------------------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------------------------------------------

async function requireProduct(tx: TenantTx, productId: string): Promise<Product> {
  const product = await tx.product.findUnique({ where: { id: productId } });
  if (!product) throw new NotFoundError("Product not found.");
  return product;
}

/** Case-insensitive SKU clash inside the tenant (optionally ignoring the product being edited). */
async function assertSkuAvailable(tx: TenantTx, sku: string, exceptProductId?: string): Promise<void> {
  const clash = await tx.product.findFirst({
    where: { sku: { equals: sku, mode: "insensitive" }, ...(exceptProductId ? { id: { not: exceptProductId } } : {}) },
    select: { id: true, sku: true },
  });
  if (clash) throw new ProductFieldError("sku", `A product with SKU ${clash.sku} already exists`);
}

function isUniqueViolation(err: unknown): boolean {
  return isPrismaKnownError(err) && err.code === "P2002";
}

function isForeignKeyViolation(err: unknown): boolean {
  return isPrismaKnownError(err) && err.code === "P2003";
}

/**
 * Renumbers a product's routing to 10, 20, 30 … (optionally after moving one step up/down) inside `tx`.
 * Phase 1 parks every row whose sequence changes on a unique negative temporary; phase 2 writes the finals.
 * Returns the plan so callers can audit before/after sequences.
 */
export async function renumberOperations(
  tx: TenantTx,
  productId: string,
  move?: { id: string; direction: MoveDirection },
): Promise<{ id: string; from: number; to: number }[]> {
  const rows = await tx.productOperation.findMany({
    where: { productId },
    select: { id: true, sequence: true },
    orderBy: { sequence: "asc" },
  });
  const current = new Map(rows.map((r) => [r.id, r.sequence]));
  const plan = planRenumber(rows, move).filter((step) => current.get(step.id) !== step.finalSequence);

  for (const step of plan) {
    await tx.productOperation.update({ where: { id: step.id }, data: { sequence: step.tempSequence } });
  }
  for (const step of plan) {
    await tx.productOperation.update({ where: { id: step.id }, data: { sequence: step.finalSequence } });
  }
  return plan.map((step) => ({ id: step.id, from: current.get(step.id) ?? step.finalSequence, to: step.finalSequence }));
}

/**
 * Validates the work center / fixed machine pair for a routing step. The machine (plain FK, spec §2) must exist
 * in this tenant, belong to `workCenterId` and not be retired.
 */
async function resolveRoutingTarget(
  tx: TenantTx,
  workCenterId: string,
  machineId: string | undefined,
): Promise<{ workCenter: { id: string; code: string; name: string }; machine: { id: string; code: string } | null }> {
  const workCenter = await tx.workCenter.findUnique({
    where: { id: workCenterId },
    select: { id: true, code: true, name: true, isActive: true },
  });
  if (!workCenter) throw new ProductFieldError("workCenterId", "Select a work center");
  if (!workCenter.isActive) throw new ProductFieldError("workCenterId", "This work center is inactive");

  if (!machineId) return { workCenter, machine: null };

  const machine = await tx.machine.findUnique({
    where: { id: machineId },
    select: { id: true, code: true, workCenterId: true, status: true },
  });
  if (!machine) throw new ProductFieldError("machineId", "Select a machine");
  if (machine.workCenterId !== workCenter.id) throw new ProductFieldError("machineId", MACHINE_WORK_CENTER_MESSAGE);
  if (machine.status === "INACTIVE") throw new ProductFieldError("machineId", MACHINE_INACTIVE_MESSAGE);
  return { workCenter, machine: { id: machine.id, code: machine.code } };
}

function operationLabel(productSku: string, sequence: number, workCenterCode: string): string {
  return `${productSku} · ${sequence} ${workCenterCode}`;
}

// ---------------------------------------------------------------------------------------------------------------
// Products
// ---------------------------------------------------------------------------------------------------------------

export async function createProduct(db: TenantDb, session: Session, input: ProductInput): Promise<Product> {
  const ctx = await auditContext(session);
  try {
    return await db.$transaction(async (tx) => {
      await assertSkuAvailable(tx, input.sku);
      const product = await tx.product.create({
        data: {
          tenantId: session.tenant.id,
          sku: input.sku,
          name: input.name,
          description: input.description ?? null,
          unit: input.unit,
          isActive: input.isActive ?? true,
        },
      });
      await audit(tx, ctx, {
        entityType: "Product",
        entityId: product.id,
        entityLabel: product.sku,
        action: "CREATE",
        after: product,
        summary: `created product ${product.sku} (${product.name})`,
      });
      return product;
    });
  } catch (err) {
    if (isUniqueViolation(err)) throw new ProductFieldError("sku", `A product with SKU ${input.sku} already exists`);
    throw err;
  }
}

export async function updateProduct(db: TenantDb, session: Session, productId: string, input: ProductInput): Promise<Product> {
  const ctx = await auditContext(session);
  try {
    return await db.$transaction(async (tx) => {
      const before = await requireProduct(tx, productId);
      await assertSkuAvailable(tx, input.sku, productId);
      const after = await tx.product.update({
        where: { id: productId },
        data: {
          sku: input.sku,
          name: input.name,
          description: input.description ?? null,
          unit: input.unit,
          ...(input.isActive === undefined ? {} : { isActive: input.isActive }),
        },
      });
      await audit(tx, ctx, {
        entityType: "Product",
        entityId: after.id,
        entityLabel: after.sku,
        action: "UPDATE",
        before,
        after,
        summary: `updated product ${after.sku}`,
      });
      return after;
    });
  } catch (err) {
    if (isUniqueViolation(err)) throw new ProductFieldError("sku", `A product with SKU ${input.sku} already exists`);
    throw err;
  }
}

/** Deactivate (hide from pickers) or reactivate. No-op when already in the requested state. */
export async function setProductActive(db: TenantDb, session: Session, productId: string, isActive: boolean): Promise<Product> {
  const ctx = await auditContext(session);
  return db.$transaction(async (tx) => {
    const before = await requireProduct(tx, productId);
    if (before.isActive === isActive) return before;
    const after = await tx.product.update({ where: { id: productId }, data: { isActive } });
    await audit(tx, ctx, {
      entityType: "Product",
      entityId: after.id,
      entityLabel: after.sku,
      action: "UPDATE",
      before,
      after,
      summary: `${isActive ? "reactivated" : "deactivated"} product ${after.sku}`,
    });
    return after;
  });
}

export class ProductInUseError extends DomainError {
  readonly orderCount: number;

  constructor(sku: string, orderCount: number) {
    super(
      `Product ${sku} is used by ${orderCount} order${orderCount === 1 ? "" : "s"} and cannot be deleted. Deactivate it instead.`,
      "product_in_use",
      409,
    );
    this.orderCount = orderCount;
  }
}

/**
 * Hard delete — only when no order references the product (count check + P2003 safety net, spec §2).
 * BOM items and routing steps cascade at the database.
 */
export async function deleteProduct(db: TenantDb, session: Session, productId: string): Promise<{ sku: string }> {
  const ctx = await auditContext(session);
  try {
    return await db.$transaction(async (tx) => {
      const product = await requireProduct(tx, productId);
      const orderCount = await tx.order.count({ where: { productId } });
      if (orderCount > 0) throw new ProductInUseError(product.sku, orderCount);
      const [bomItems, operations] = await Promise.all([
        tx.bomItem.findMany({ where: { productId } }),
        tx.productOperation.findMany({ where: { productId }, orderBy: { sequence: "asc" } }),
      ]);
      await tx.product.delete({ where: { id: productId } });
      await audit(tx, ctx, {
        entityType: "Product",
        entityId: product.id,
        entityLabel: product.sku,
        action: "DELETE",
        before: { ...product, bomItems, operations },
        summary: `deleted product ${product.sku} (${bomItems.length} BOM line${bomItems.length === 1 ? "" : "s"}, ${operations.length} routing step${operations.length === 1 ? "" : "s"})`,
      });
      return { sku: product.sku };
    });
  } catch (err) {
    if (isForeignKeyViolation(err)) {
      throw new DomainError("This product is referenced by orders and cannot be deleted. Deactivate it instead.", "product_in_use", 409);
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------------------------------------------
// BOM
// ---------------------------------------------------------------------------------------------------------------

async function requireActiveMaterial(tx: TenantTx, materialId: string) {
  const material = await tx.material.findUnique({
    where: { id: materialId },
    select: { id: true, code: true, name: true, unit: true, isActive: true },
  });
  if (!material) throw new ProductFieldError("materialId", "Select a material");
  if (!material.isActive) throw new ProductFieldError("materialId", "This material is inactive");
  return material;
}

function bomLabel(productSku: string, materialCode: string): string {
  return `${productSku} · ${materialCode}`;
}

export async function addBomItem(db: TenantDb, session: Session, input: BomItemInput): Promise<BomItem> {
  const ctx = await auditContext(session);
  try {
    return await db.$transaction(async (tx) => {
      const product = await requireProduct(tx, input.productId);
      const material = await requireActiveMaterial(tx, input.materialId);
      const existing = await tx.bomItem.findFirst({
        where: { productId: product.id, materialId: material.id },
        select: { id: true },
      });
      if (existing) throw new ProductFieldError("materialId", BOM_DUPLICATE_MESSAGE);

      const item = await tx.bomItem.create({
        data: {
          tenantId: session.tenant.id,
          productId: product.id,
          materialId: material.id,
          quantityPerUnit: input.quantityPerUnit,
          scrapPercent: input.scrapPercent,
          note: input.note ?? null,
        },
      });
      await audit(tx, ctx, {
        entityType: "BomItem",
        entityId: item.id,
        entityLabel: bomLabel(product.sku, material.code),
        action: "CREATE",
        after: item,
        summary: `added ${material.code} to the BOM of ${product.sku} (${formatQty(input.quantityPerUnit, material.unit)} per ${product.unit}, ${input.scrapPercent}% scrap)`,
      });
      return item;
    });
  } catch (err) {
    if (isUniqueViolation(err)) throw new ProductFieldError("materialId", BOM_DUPLICATE_MESSAGE);
    throw err;
  }
}

/** Edits quantity / scrap / note. The material of a BOM line is fixed (remove + add to change it). */
export async function updateBomItem(db: TenantDb, session: Session, bomItemId: string, input: BomItemInput): Promise<BomItem> {
  const ctx = await auditContext(session);
  return db.$transaction(async (tx) => {
    const before = await tx.bomItem.findUnique({
      where: { id: bomItemId },
      include: { product: { select: { sku: true } }, material: { select: { code: true } } },
    });
    if (!before || before.productId !== input.productId) throw new NotFoundError("BOM item not found.");
    if (before.materialId !== input.materialId) {
      throw new ProductFieldError("materialId", "The material of a BOM line cannot be changed — remove the line and add the new material");
    }
    const { product, material, ...beforeRow } = before;
    const after = await tx.bomItem.update({
      where: { id: bomItemId },
      data: {
        quantityPerUnit: input.quantityPerUnit,
        scrapPercent: input.scrapPercent,
        note: input.note ?? null,
      },
    });
    await audit(tx, ctx, {
      entityType: "BomItem",
      entityId: after.id,
      entityLabel: bomLabel(product.sku, material.code),
      action: "UPDATE",
      before: beforeRow,
      after,
      summary: `updated BOM line ${material.code} on ${product.sku}`,
    });
    return after;
  });
}

export async function removeBomItem(db: TenantDb, session: Session, bomItemId: string): Promise<void> {
  const ctx = await auditContext(session);
  await db.$transaction(async (tx) => {
    const before = await tx.bomItem.findUnique({
      where: { id: bomItemId },
      include: { product: { select: { sku: true } }, material: { select: { code: true } } },
    });
    if (!before) throw new NotFoundError("BOM item not found.");
    const { product, material, ...beforeRow } = before;
    await tx.bomItem.delete({ where: { id: bomItemId } });
    await audit(tx, ctx, {
      entityType: "BomItem",
      entityId: before.id,
      entityLabel: bomLabel(product.sku, material.code),
      action: "DELETE",
      before: beforeRow,
      summary: `removed ${material.code} from the BOM of ${product.sku}`,
    });
  });
}

// ---------------------------------------------------------------------------------------------------------------
// Routing
// ---------------------------------------------------------------------------------------------------------------

export async function addOperation(db: TenantDb, session: Session, input: ProductOperationInput): Promise<ProductOperation> {
  const ctx = await auditContext(session);
  return db.$transaction(async (tx) => {
    const product = await requireProduct(tx, input.productId);
    const { workCenter, machine } = await resolveRoutingTarget(tx, input.workCenterId, input.machineId);
    const existing = await tx.productOperation.findMany({
      where: { productId: product.id },
      select: { id: true, sequence: true },
    });
    const created = await tx.productOperation.create({
      data: {
        tenantId: session.tenant.id,
        productId: product.id,
        sequence: nextSequence(existing),
        workCenterId: workCenter.id,
        machineId: machine?.id ?? null,
        setupMinutes: input.setupMinutes,
        runMinutesPerUnit: input.runMinutesPerUnit,
      },
    });
    // Keep the routing on 10/20/30 even after earlier removals left gaps (spec §4 "Routing": add runs renumber).
    await renumberOperations(tx, product.id);
    const operation = await tx.productOperation.findUniqueOrThrow({ where: { id: created.id } });
    await audit(tx, ctx, {
      entityType: "ProductOperation",
      entityId: operation.id,
      entityLabel: operationLabel(product.sku, operation.sequence, workCenter.code),
      action: "CREATE",
      after: operation,
      summary: `added routing step ${operation.sequence} ${workCenter.code}${machine ? ` (${machine.code})` : ""} to ${product.sku}`,
    });
    return operation;
  });
}

export async function updateOperation(
  db: TenantDb,
  session: Session,
  operationId: string,
  input: ProductOperationInput,
): Promise<ProductOperation> {
  const ctx = await auditContext(session);
  return db.$transaction(async (tx) => {
    const before = await tx.productOperation.findUnique({
      where: { id: operationId },
      include: { product: { select: { sku: true } } },
    });
    if (!before || before.productId !== input.productId) throw new NotFoundError("Routing step not found.");
    const { workCenter, machine } = await resolveRoutingTarget(tx, input.workCenterId, input.machineId);
    const { product, ...beforeRow } = before;
    const after = await tx.productOperation.update({
      where: { id: operationId },
      data: {
        workCenterId: workCenter.id,
        machineId: machine?.id ?? null,
        setupMinutes: input.setupMinutes,
        runMinutesPerUnit: input.runMinutesPerUnit,
      },
    });
    await audit(tx, ctx, {
      entityType: "ProductOperation",
      entityId: after.id,
      entityLabel: operationLabel(product.sku, after.sequence, workCenter.code),
      action: "UPDATE",
      before: beforeRow,
      after,
      summary: `updated routing step ${after.sequence} ${workCenter.code} on ${product.sku}`,
    });
    return after;
  });
}

export async function removeOperation(db: TenantDb, session: Session, operationId: string): Promise<void> {
  const ctx = await auditContext(session);
  await db.$transaction(async (tx) => {
    const before = await tx.productOperation.findUnique({
      where: { id: operationId },
      include: { product: { select: { sku: true } }, workCenter: { select: { code: true } } },
    });
    if (!before) throw new NotFoundError("Routing step not found.");
    const { product, workCenter, ...beforeRow } = before;
    await tx.productOperation.delete({ where: { id: operationId } });
    await renumberOperations(tx, before.productId);
    await audit(tx, ctx, {
      entityType: "ProductOperation",
      entityId: before.id,
      entityLabel: operationLabel(product.sku, before.sequence, workCenter.code),
      action: "DELETE",
      before: beforeRow,
      summary: `removed routing step ${before.sequence} ${workCenter.code} from ${product.sku}`,
    });
  });
}

/**
 * Moves one step up/down by swapping with its neighbour, then renumbers — all in one transaction using the
 * two-phase plan. Returns `moved: false` when the step is already first/last (nothing is written).
 */
export async function moveOperation(db: TenantDb, session: Session, input: MoveOperationInput): Promise<{ moved: boolean }> {
  const ctx = await auditContext(session);
  return db.$transaction(async (tx) => {
    const op = await tx.productOperation.findUnique({
      where: { id: input.operationId },
      include: { product: { select: { sku: true } }, workCenter: { select: { code: true } } },
    });
    if (!op || op.productId !== input.productId) throw new NotFoundError("Routing step not found.");
    const rows = await tx.productOperation.findMany({
      where: { productId: op.productId },
      select: { id: true, sequence: true },
    });
    if (!canMove(rows, op.id, input.direction)) return { moved: false };

    const changes = await renumberOperations(tx, op.productId, { id: op.id, direction: input.direction });
    const own = changes.find((c) => c.id === op.id);
    const { product, workCenter, ...beforeRow } = op;
    const afterRow = { ...beforeRow, sequence: own?.to ?? op.sequence };
    await audit(tx, ctx, {
      entityType: "ProductOperation",
      entityId: op.id,
      entityLabel: operationLabel(product.sku, afterRow.sequence, workCenter.code),
      action: "UPDATE",
      before: beforeRow,
      after: afterRow,
      summary: `moved routing step ${workCenter.code} ${input.direction} on ${product.sku} (${op.sequence} → ${afterRow.sequence})`,
    });
    return { moved: true };
  });
}
