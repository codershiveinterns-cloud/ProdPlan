/**
 * Products list query (docs/M1_SPEC.md §6.5): server-side search (sku/name), sort, pagination and the
 * "buildable from stock" figure per row via `coverageFor()` (src/lib/bom.ts — no page computes BOM maths inline).
 */
import type { Prisma } from "@/generated/prisma/client";
import { coverageFor } from "@/lib/bom";
import type { TenantDb } from "@/lib/db";
import { PRODUCTS_PAGE_SIZE, type ProductListParams, type ProductSortKey, type SortDir } from "./list-params";

export type ProductListRow = {
  id: string;
  sku: string;
  name: string;
  unit: string;
  isActive: boolean;
  bomLines: number;
  routingSteps: number;
  /** floor(min onHand / requiredPerUnit) over the BOM; null when the product has no constraining BOM line. */
  buildable: number | null;
  createdAt: string;
};

function orderBy(sort: ProductSortKey, dir: SortDir): Prisma.ProductOrderByWithRelationInput[] {
  const tieBreak: Prisma.ProductOrderByWithRelationInput = { sku: "asc" };
  switch (sort) {
    case "name":
      return [{ name: dir }, tieBreak];
    case "unit":
      return [{ unit: dir }, tieBreak];
    case "bomLines":
      return [{ bomItems: { _count: dir } }, tieBreak];
    case "routingSteps":
      return [{ operations: { _count: dir } }, tieBreak];
    case "createdAt":
      return [{ createdAt: dir }, tieBreak];
    case "sku":
    default:
      return [{ sku: dir }];
  }
}

export function productListWhere(params: Pick<ProductListParams, "q" | "includeInactive">): Prisma.ProductWhereInput {
  const where: Prisma.ProductWhereInput = {};
  if (!params.includeInactive) where.isActive = true;
  if (params.q) {
    where.OR = [
      { sku: { contains: params.q, mode: "insensitive" } },
      { name: { contains: params.q, mode: "insensitive" } },
    ];
  }
  return where;
}

export async function listProducts(
  db: TenantDb,
  params: ProductListParams,
): Promise<{ rows: ProductListRow[]; total: number }> {
  const where = productListWhere(params);
  const [total, products] = await Promise.all([
    db.product.count({ where }),
    db.product.findMany({
      where,
      orderBy: orderBy(params.sort, params.dir),
      skip: (params.page - 1) * PRODUCTS_PAGE_SIZE,
      take: PRODUCTS_PAGE_SIZE,
      select: {
        id: true,
        sku: true,
        name: true,
        unit: true,
        isActive: true,
        createdAt: true,
        _count: { select: { bomItems: true, operations: true } },
        bomItems: {
          select: {
            materialId: true,
            quantityPerUnit: true,
            scrapPercent: true,
            material: { select: { stockOnHand: true } },
          },
        },
      },
    }),
  ]);

  const rows: ProductListRow[] = products.map((p) => ({
    id: p.id,
    sku: p.sku,
    name: p.name,
    unit: p.unit,
    isActive: p.isActive,
    bomLines: p._count.bomItems,
    routingSteps: p._count.operations,
    buildable: coverageFor(
      p.bomItems.map((b) => ({
        materialId: b.materialId,
        quantityPerUnit: b.quantityPerUnit,
        scrapPercent: b.scrapPercent,
        stockOnHand: b.material.stockOnHand,
      })),
    ).buildable,
    createdAt: p.createdAt.toISOString(),
  }));

  return { rows, total };
}
