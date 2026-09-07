/**
 * Materials list — URL contract (docs/M1_SPEC.md §5 "List URL contract") and the server-side query behind it.
 *
 *   /materials?q=&page=&sort=&dir=&belowThreshold=1&includeInactive=1
 *
 * Search matches code or name (case-insensitive contains). `belowThreshold=1` keeps rows with
 * `stockOnHand ≤ reorderThreshold` (a column-to-column comparison via a Prisma field reference). Inactive
 * materials are hidden unless `includeInactive=1`. 25 rows per page, default sort `code asc`.
 */
import type { Prisma } from "@/generated/prisma/client";
import type { TenantDb } from "@/lib/db";

export const MATERIALS_PAGE_SIZE = 25;

export const MATERIAL_SORT_KEYS = ["code", "name", "unit", "onHand", "threshold", "leadTime", "supplier"] as const;
export type MaterialSortKey = (typeof MATERIAL_SORT_KEYS)[number];
export type SortDir = "asc" | "desc";

export type MaterialListParams = {
  q: string;
  page: number;
  sort: MaterialSortKey;
  dir: SortDir;
  belowThreshold: boolean;
  includeInactive: boolean;
};

export const DEFAULT_MATERIAL_LIST_PARAMS: MaterialListParams = {
  q: "",
  page: 1,
  sort: "code",
  dir: "asc",
  belowThreshold: false,
  includeInactive: false,
};

type SearchParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function flag(value: string | string[] | undefined): boolean {
  const v = first(value)?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "on" || v === "yes";
}

function isSortKey(value: string | undefined): value is MaterialSortKey {
  return value !== undefined && (MATERIAL_SORT_KEYS as readonly string[]).includes(value);
}

/** Tolerant parser: unknown sort keys / directions / pages fall back to the defaults. */
export function parseMaterialListParams(searchParams: SearchParams): MaterialListParams {
  const q = (first(searchParams.q) ?? "").trim().slice(0, 120);
  const pageRaw = Number.parseInt(first(searchParams.page) ?? "", 10);
  const page = Number.isFinite(pageRaw) && pageRaw >= 1 ? pageRaw : 1;
  const sortRaw = first(searchParams.sort)?.trim();
  const sort = isSortKey(sortRaw) ? sortRaw : DEFAULT_MATERIAL_LIST_PARAMS.sort;
  const dirRaw = first(searchParams.dir)?.trim().toLowerCase();
  const dir: SortDir = dirRaw === "desc" ? "desc" : "asc";
  return {
    q,
    page,
    sort,
    dir,
    belowThreshold: flag(searchParams.belowThreshold),
    includeInactive: flag(searchParams.includeInactive),
  };
}

/** Query string for a set of params — only non-default keys are written, so URLs stay short and shareable. */
export function materialListQuery(params: Partial<MaterialListParams>): string {
  const p = new URLSearchParams();
  if (params.q) p.set("q", params.q);
  if (params.page !== undefined && params.page > 1) p.set("page", String(params.page));
  const sort = params.sort ?? DEFAULT_MATERIAL_LIST_PARAMS.sort;
  const dir = params.dir ?? DEFAULT_MATERIAL_LIST_PARAMS.dir;
  if (sort !== DEFAULT_MATERIAL_LIST_PARAMS.sort || dir !== DEFAULT_MATERIAL_LIST_PARAMS.dir) {
    p.set("sort", sort);
    p.set("dir", dir);
  }
  if (params.belowThreshold) p.set("belowThreshold", "1");
  if (params.includeInactive) p.set("includeInactive", "1");
  return p.toString();
}

export function materialListHref(params: Partial<MaterialListParams>, patch: Partial<MaterialListParams> = {}): string {
  const query = materialListQuery({ ...params, ...patch });
  return query ? `/materials?${query}` : "/materials";
}

/** Number of active module filters (search excluded — it has its own clear button). */
export function countActiveMaterialFilters(params: Pick<MaterialListParams, "belowThreshold" | "includeInactive">): number {
  return Number(params.belowThreshold) + Number(params.includeInactive);
}

export type MaterialListRow = Prisma.MaterialGetPayload<{
  include: { _count: { select: { bomItems: true; movements: true } } };
}>;

function orderBy(sort: MaterialSortKey, dir: SortDir): Prisma.MaterialOrderByWithRelationInput[] {
  const tieBreak: Prisma.MaterialOrderByWithRelationInput = { code: "asc" };
  switch (sort) {
    case "name":
      return [{ name: dir }, tieBreak];
    case "unit":
      return [{ unit: dir }, tieBreak];
    case "onHand":
      return [{ stockOnHand: dir }, tieBreak];
    case "threshold":
      return [{ reorderThreshold: dir }, tieBreak];
    case "leadTime":
      return [{ reorderLeadTimeDays: dir }, tieBreak];
    case "supplier":
      return [{ supplier: { sort: dir, nulls: "last" } }, tieBreak];
    case "code":
    default:
      return [{ code: dir }];
  }
}

export function materialListWhere(db: TenantDb, params: MaterialListParams): Prisma.MaterialWhereInput {
  const where: Prisma.MaterialWhereInput = {};
  if (!params.includeInactive) where.isActive = true;
  if (params.belowThreshold) where.stockOnHand = { lte: db.material.fields.reorderThreshold };
  if (params.q) {
    where.OR = [
      { code: { contains: params.q, mode: "insensitive" } },
      { name: { contains: params.q, mode: "insensitive" } },
    ];
  }
  return where;
}

/** Server-side filtering, sorting and pagination (25/page). The row counts feed the Delete-vs-Deactivate choice. */
export async function listMaterials(
  db: TenantDb,
  params: MaterialListParams,
): Promise<{ rows: MaterialListRow[]; total: number; page: number; pageSize: number }> {
  const where = materialListWhere(db, params);
  const total = await db.material.count({ where });
  const pageCount = Math.max(1, Math.ceil(total / MATERIALS_PAGE_SIZE));
  const page = Math.min(params.page, pageCount);
  const rows = await db.material.findMany({
    where,
    orderBy: orderBy(params.sort, params.dir),
    skip: (page - 1) * MATERIALS_PAGE_SIZE,
    take: MATERIALS_PAGE_SIZE,
    include: { _count: { select: { bomItems: true, movements: true } } },
  });
  return { rows, total, page, pageSize: MATERIALS_PAGE_SIZE };
}
