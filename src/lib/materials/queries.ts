/**
 * Read queries for the material detail page (docs/M1_SPEC.md §6.4): the material itself, its paginated ledger,
 * where it is used (BOM lines with the spec's `requiredPerUnit` maths from src/lib/bom.ts) and its audit history.
 */
import type { AuditLog, Material, Prisma } from "@/generated/prisma/client";
import { requiredPerUnit } from "@/lib/bom";
import type { TenantDb } from "@/lib/db";

export const LEDGER_PAGE_SIZE = 25;
export const AUDIT_HISTORY_SIZE = 20;

export function getMaterial(db: TenantDb, materialId: string): Promise<Material | null> {
  return db.material.findUnique({ where: { id: materialId } });
}

export type LedgerRow = Prisma.StockMovementGetPayload<{
  include: { createdBy: { select: { id: true; name: true; email: true } } };
}>;

/** Newest first, 25 per page. `page` is clamped to the last page so a stale link never renders an empty table. */
export async function listLedger(
  db: TenantDb,
  materialId: string,
  page: number,
): Promise<{ rows: LedgerRow[]; total: number; page: number; pageSize: number }> {
  const where = { materialId };
  const total = await db.stockMovement.count({ where });
  const pageCount = Math.max(1, Math.ceil(total / LEDGER_PAGE_SIZE));
  const current = Math.min(Math.max(1, page), pageCount);
  const rows = await db.stockMovement.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    skip: (current - 1) * LEDGER_PAGE_SIZE,
    take: LEDGER_PAGE_SIZE,
    include: { createdBy: { select: { id: true, name: true, email: true } } },
  });
  return { rows, total, page: current, pageSize: LEDGER_PAGE_SIZE };
}

export type WhereUsedRow = {
  bomItemId: string;
  productId: string;
  sku: string;
  productName: string;
  productUnit: string;
  productActive: boolean;
  /** Material units per one product unit (before scrap). */
  quantityPerUnit: number;
  scrapPercent: number;
  /** quantityPerUnit × (1 + scrap/100), 3 dp (spec §4 "BOM maths"). */
  requiredPerUnit: number;
  note: string | null;
};

/** Products whose BOM uses the material, with qty/unit, scrap and the derived required-per-unit. */
export async function whereUsed(db: TenantDb, materialId: string): Promise<WhereUsedRow[]> {
  const items = await db.bomItem.findMany({
    where: { materialId },
    include: { product: { select: { id: true, sku: true, name: true, unit: true, isActive: true } } },
    orderBy: [{ product: { sku: "asc" } }],
  });
  return items.map((item) => ({
    bomItemId: item.id,
    productId: item.product.id,
    sku: item.product.sku,
    productName: item.product.name,
    productUnit: item.product.unit,
    productActive: item.product.isActive,
    quantityPerUnit: Number(String(item.quantityPerUnit)),
    scrapPercent: Number(String(item.scrapPercent)),
    requiredPerUnit: requiredPerUnit(item.quantityPerUnit, item.scrapPercent),
    note: item.note,
  }));
}

/**
 * Audit rows for the material: its own CREATE/UPDATE/DELETE entries plus the CREATE entries of its stock
 * movements (matched through `after.materialId`, which `applyStockMovement()` always writes). Newest first.
 */
export function materialAuditRows(db: TenantDb, materialId: string, take = AUDIT_HISTORY_SIZE): Promise<AuditLog[]> {
  return db.auditLog.findMany({
    where: {
      OR: [
        { entityType: "Material", entityId: materialId },
        { entityType: "StockMovement", after: { path: ["materialId"], equals: materialId } },
      ],
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take,
  });
}
