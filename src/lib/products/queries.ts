/**
 * Read side of the products module (docs/M1_SPEC.md §6.5): product detail with BOM coverage and routing, the
 * option lists the dialogs need, and the product's activity feed. Everything returned here is a plain DTO
 * (Decimals → numbers, Dates → ISO strings) so pages can hand it straight to Client Components.
 */
import type { Prisma } from "@/generated/prisma/client";
import type { MachineStatus } from "@/generated/prisma/enums";
import { coverageFor } from "@/lib/bom";
import type { TenantDb } from "@/lib/db";
import { toPlain } from "@/lib/serialize";
import { sortBySequence } from "@/lib/routing";

// ---------------------------------------------------------------------------------------------------------------
// DTOs
// ---------------------------------------------------------------------------------------------------------------

export type ProductDTO = {
  id: string;
  sku: string;
  name: string;
  description: string | null;
  unit: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type BomLineDTO = {
  id: string;
  materialId: string;
  materialCode: string;
  materialName: string;
  materialUnit: string;
  materialActive: boolean;
  quantityPerUnit: number;
  scrapPercent: number;
  /** quantityPerUnit × (1 + scrap/100), 3 dp (src/lib/bom.ts). */
  requiredPerUnit: number;
  onHand: number;
  /** Units buildable from this line alone; null when the line needs nothing. */
  buildable: number | null;
  /** True for the line that determines the product's "Buildable from stock". */
  isLimiting: boolean;
  note: string | null;
};

export type OperationDTO = {
  id: string;
  sequence: number;
  workCenterId: string;
  workCenterCode: string;
  workCenterName: string;
  machineId: string | null;
  machineCode: string | null;
  machineName: string | null;
  setupMinutes: number;
  runMinutesPerUnit: number;
};

export type ProductDetail = ProductDTO & {
  /** Orders referencing the product (any status) — > 0 blocks hard delete. */
  orderCount: number;
  bom: {
    items: BomLineDTO[];
    buildable: number | null;
    limitingMaterialId: string | null;
  };
  operations: OperationDTO[];
};

export type MaterialOption = { id: string; code: string; name: string; unit: string; isActive: boolean };
export type WorkCenterOption = { id: string; code: string; name: string; isActive: boolean };
export type MachineOption = { id: string; code: string; name: string; workCenterId: string; status: MachineStatus };

// ---------------------------------------------------------------------------------------------------------------
// Product
// ---------------------------------------------------------------------------------------------------------------

export function toProductDTO(p: {
  id: string;
  sku: string;
  name: string;
  description: string | null;
  unit: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}): ProductDTO {
  return {
    id: p.id,
    sku: p.sku,
    name: p.name,
    description: p.description,
    unit: p.unit,
    isActive: p.isActive,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  };
}

export async function getProduct(db: TenantDb, id: string): Promise<ProductDTO | null> {
  const row = await db.product.findUnique({ where: { id } });
  return row ? toProductDTO(row) : null;
}

const detailInclude = {
  _count: { select: { orders: true } },
  bomItems: {
    include: {
      material: { select: { id: true, code: true, name: true, unit: true, stockOnHand: true, isActive: true } },
    },
    orderBy: { material: { code: "asc" } },
  },
  operations: {
    include: {
      workCenter: { select: { id: true, code: true, name: true } },
      machine: { select: { id: true, code: true, name: true } },
    },
    orderBy: { sequence: "asc" },
  },
} satisfies Prisma.ProductInclude;

type ProductWithDetail = Prisma.ProductGetPayload<{ include: typeof detailInclude }>;

export function buildProductDetail(p: ProductWithDetail): ProductDetail {
  const coverage = coverageFor(
    p.bomItems.map((b) => ({
      materialId: b.materialId,
      quantityPerUnit: b.quantityPerUnit,
      scrapPercent: b.scrapPercent,
      stockOnHand: b.material.stockOnHand,
    })),
  );
  const lineByMaterial = new Map(coverage.lines.map((l) => [l.materialId, l]));

  const items: BomLineDTO[] = p.bomItems.map((b) => {
    const line = lineByMaterial.get(b.materialId);
    return {
      id: b.id,
      materialId: b.materialId,
      materialCode: b.material.code,
      materialName: b.material.name,
      materialUnit: b.material.unit,
      materialActive: b.material.isActive,
      quantityPerUnit: toPlain(b.quantityPerUnit),
      scrapPercent: toPlain(b.scrapPercent),
      requiredPerUnit: line?.requiredPerUnit ?? 0,
      onHand: line?.onHand ?? toPlain(b.material.stockOnHand),
      buildable: line?.buildable ?? null,
      isLimiting: coverage.limitingMaterialId === b.materialId,
      note: b.note,
    };
  });

  const operations: OperationDTO[] = sortBySequence(p.operations).map((op) => ({
    id: op.id,
    sequence: op.sequence,
    workCenterId: op.workCenterId,
    workCenterCode: op.workCenter.code,
    workCenterName: op.workCenter.name,
    machineId: op.machineId,
    machineCode: op.machine?.code ?? null,
    machineName: op.machine?.name ?? null,
    setupMinutes: op.setupMinutes,
    runMinutesPerUnit: toPlain(op.runMinutesPerUnit),
  }));

  return {
    ...toProductDTO(p),
    orderCount: p._count.orders,
    bom: { items, buildable: coverage.buildable, limitingMaterialId: coverage.limitingMaterialId },
    operations,
  };
}

export async function getProductDetail(db: TenantDb, id: string): Promise<ProductDetail | null> {
  const row = await db.product.findUnique({ where: { id }, include: detailInclude });
  return row ? buildProductDetail(row) : null;
}

// ---------------------------------------------------------------------------------------------------------------
// Option lists for the BOM / routing dialogs
// ---------------------------------------------------------------------------------------------------------------

/** Active materials, code order — the `BomItemDialog` Combobox (inactive rows are hidden from pickers). */
export async function listMaterialOptions(db: TenantDb): Promise<MaterialOption[]> {
  return db.material.findMany({
    where: { isActive: true },
    orderBy: { code: "asc" },
    select: { id: true, code: true, name: true, unit: true, isActive: true },
  });
}

/**
 * Active work centers plus every non-retired machine (ACTIVE / MAINTENANCE), for `OperationDialog`.
 * `keepMachineIds` re-includes machines that existing operations still reference even if they were retired,
 * so an edit dialog can display the current value.
 */
export async function listRoutingOptions(
  db: TenantDb,
  keepMachineIds: readonly string[] = [],
): Promise<{ workCenters: WorkCenterOption[]; machines: MachineOption[] }> {
  const [workCenters, machines] = await Promise.all([
    db.workCenter.findMany({
      where: { isActive: true },
      orderBy: { code: "asc" },
      select: { id: true, code: true, name: true, isActive: true },
    }),
    db.machine.findMany({
      where: {
        OR: [{ status: { not: "INACTIVE" } }, ...(keepMachineIds.length ? [{ id: { in: [...keepMachineIds] } }] : [])],
      },
      orderBy: [{ workCenterId: "asc" }, { code: "asc" }],
      select: { id: true, code: true, name: true, workCenterId: true, status: true },
    }),
  ]);
  return { workCenters, machines };
}

// ---------------------------------------------------------------------------------------------------------------
// Activity
// ---------------------------------------------------------------------------------------------------------------

export type ProductActivityRow = {
  id: string;
  action: Prisma.AuditLogGetPayload<object>["action"];
  entityType: string;
  entityId: string;
  entityLabel: string | null;
  actorName: string | null;
  actorEmail: string | null;
  summary: string;
  changedFields: string[];
  createdAt: Date;
};

/**
 * Audit rows for the product itself plus its BOM items and routing steps. Child rows are found through the
 * `productId` stored in their before/after snapshots, so deleted children still show up in the feed.
 */
export async function listProductActivity(db: TenantDb, productId: string, take = 20): Promise<ProductActivityRow[]> {
  return db.auditLog.findMany({
    where: {
      OR: [
        { entityType: "Product", entityId: productId },
        {
          entityType: { in: ["BomItem", "ProductOperation"] },
          OR: [
            { after: { path: ["productId"], equals: productId } },
            { before: { path: ["productId"], equals: productId } },
          ],
        },
      ],
    },
    orderBy: { createdAt: "desc" },
    take,
    select: {
      id: true,
      action: true,
      entityType: true,
      entityId: true,
      entityLabel: true,
      actorName: true,
      actorEmail: true,
      summary: true,
      changedFields: true,
      createdAt: true,
    },
  });
}
