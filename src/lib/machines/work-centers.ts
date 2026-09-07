/**
 * Work centers (docs/M1_SPEC.md §6.2): list with usage counts, create/edit, deactivate, and hard delete only when
 * no machine or routing step references the row (NoAction FKs; the count check runs inside the same transaction
 * and P2003 is still mapped by `withAction` as a last line of defence). Every mutation writes its audit row in the
 * same transaction.
 */
import type { Prisma, WorkCenter } from "@/generated/prisma/client";
import { audit, auditContext } from "@/lib/audit";
import type { Session } from "@/lib/auth/guards";
import type { TenantDb, TenantTx } from "@/lib/db";
import { NotFoundError } from "@/lib/errors";
import type { WorkCenterInput } from "@/lib/validation/work-centers";
import { InUseError } from "./errors";
import { describeUsage, type WorkCenterUsage } from "./usage";

export { describeUsage, type WorkCenterUsage } from "./usage";
import {
  containsInsensitive,
  listUrl,
  pageSlice,
  parseFlag,
  parsePage,
  parseQuery,
  parseSort,
  parseSortDir,
  type SearchParams,
  type SortDir,
} from "./list-params";

export const WORK_CENTER_SORT_KEYS = ["code", "name", "machines"] as const;
export type WorkCenterSortKey = (typeof WORK_CENTER_SORT_KEYS)[number];

export type WorkCenterListParams = {
  q: string;
  page: number;
  sort: WorkCenterSortKey;
  dir: SortDir;
  includeInactive: boolean;
};

export function parseWorkCenterListParams(sp: SearchParams): WorkCenterListParams {
  return {
    q: parseQuery(sp),
    page: parsePage(sp),
    sort: parseSort(sp, WORK_CENTER_SORT_KEYS, "code"),
    dir: parseSortDir(sp, "asc"),
    includeInactive: parseFlag(sp, "includeInactive"),
  };
}

export function workCenterListHref(params: WorkCenterListParams, patch: Partial<Omit<WorkCenterListParams, "sort">> & { sort?: string } = {}): string {
  // DataTable hands back the column's sortKey as a plain string; unknown keys fall back to the default.
  const sort = patch.sort !== undefined && (WORK_CENTER_SORT_KEYS as readonly string[]).includes(patch.sort) ? (patch.sort as WorkCenterSortKey) : params.sort;
  const p = { ...params, ...patch, sort };
  return listUrl("/work-centers", {
    q: p.q,
    page: p.page,
    sort: p.sort === "code" ? "" : p.sort,
    dir: p.sort === "code" && p.dir === "asc" ? "" : p.dir,
    includeInactive: p.includeInactive,
  });
}

export function countWorkCenterFilters(params: WorkCenterListParams): number {
  return params.includeInactive ? 1 : 0;
}

/** Plain row for the /work-centers table (already JSON-safe). */
export type WorkCenterRow = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  isActive: boolean;
  machineCount: number;
  operationCount: number;
};

function orderBy(sort: WorkCenterSortKey, dir: SortDir): Prisma.WorkCenterOrderByWithRelationInput[] {
  switch (sort) {
    case "name":
      return [{ name: dir }, { code: "asc" }];
    case "machines":
      return [{ machines: { _count: dir } }, { code: "asc" }];
    default:
      return [{ code: dir }];
  }
}

export async function listWorkCenters(
  db: TenantDb,
  params: WorkCenterListParams,
): Promise<{ rows: WorkCenterRow[]; total: number }> {
  const where: Prisma.WorkCenterWhereInput = {
    ...(params.includeInactive ? {} : { isActive: true }),
    ...(params.q
      ? { OR: [{ code: containsInsensitive(params.q) }, { name: containsInsensitive(params.q) }] }
      : {}),
  };
  const [rows, total] = await Promise.all([
    db.workCenter.findMany({
      where,
      orderBy: orderBy(params.sort, params.dir),
      ...pageSlice(params.page),
      include: { _count: { select: { machines: true, operations: true } } },
    }),
    db.workCenter.count({ where }),
  ]);
  return {
    rows: rows.map((wc) => ({
      id: wc.id,
      code: wc.code,
      name: wc.name,
      description: wc.description,
      isActive: wc.isActive,
      machineCount: wc._count.machines,
      operationCount: wc._count.operations,
    })),
    total,
  };
}

/** Active work centers for Selects (plus `keepId`, so an edit form can still show an inactive current value). */
export async function workCenterOptions(
  db: TenantDb,
  keepId?: string | null,
): Promise<Array<{ id: string; code: string; name: string; isActive: boolean }>> {
  return db.workCenter.findMany({
    where: keepId ? { OR: [{ isActive: true }, { id: keepId }] } : { isActive: true },
    orderBy: { code: "asc" },
    select: { id: true, code: true, name: true, isActive: true },
  });
}

export async function workCenterUsage(db: TenantDb | TenantTx, id: string): Promise<WorkCenterUsage> {
  const [machines, operations] = await Promise.all([
    db.machine.count({ where: { workCenterId: id } }),
    db.productOperation.count({ where: { workCenterId: id } }),
  ]);
  return { machines, operations };
}

function snapshot(wc: WorkCenter) {
  return { code: wc.code, name: wc.name, description: wc.description, isActive: wc.isActive };
}

export async function getWorkCenter(db: TenantDb, id: string): Promise<WorkCenter> {
  const wc = await db.workCenter.findUnique({ where: { id } });
  if (!wc) throw new NotFoundError("Work center not found.");
  return wc;
}

export async function createWorkCenter(db: TenantDb, session: Session, input: WorkCenterInput): Promise<WorkCenter> {
  const ctx = await auditContext(session);
  return db.$transaction(async (tx) => {
    const wc = await tx.workCenter.create({
      data: {
        tenantId: session.tenant.id,
        code: input.code,
        name: input.name,
        description: input.description ?? null,
        isActive: input.isActive ?? true,
      },
    });
    await audit(tx, ctx, {
      entityType: "WorkCenter",
      entityId: wc.id,
      entityLabel: wc.code,
      action: "CREATE",
      after: snapshot(wc),
      summary: `Created work center ${wc.code} (${wc.name})`,
    });
    return wc;
  });
}

export async function updateWorkCenter(
  db: TenantDb,
  session: Session,
  id: string,
  input: WorkCenterInput,
): Promise<WorkCenter> {
  const ctx = await auditContext(session);
  return db.$transaction(async (tx) => {
    const before = await tx.workCenter.findUnique({ where: { id } });
    if (!before) throw new NotFoundError("Work center not found.");
    const wc = await tx.workCenter.update({
      where: { id },
      data: {
        code: input.code,
        name: input.name,
        description: input.description ?? null,
        ...(input.isActive === undefined ? {} : { isActive: input.isActive }),
      },
    });
    await audit(tx, ctx, {
      entityType: "WorkCenter",
      entityId: wc.id,
      entityLabel: wc.code,
      action: "UPDATE",
      before: snapshot(before),
      after: snapshot(wc),
      summary: `Updated work center ${wc.code}`,
    });
    return wc;
  });
}

export async function setWorkCenterActive(
  db: TenantDb,
  session: Session,
  id: string,
  isActive: boolean,
): Promise<WorkCenter> {
  const ctx = await auditContext(session);
  return db.$transaction(async (tx) => {
    const before = await tx.workCenter.findUnique({ where: { id } });
    if (!before) throw new NotFoundError("Work center not found.");
    const wc = await tx.workCenter.update({ where: { id }, data: { isActive } });
    await audit(tx, ctx, {
      entityType: "WorkCenter",
      entityId: wc.id,
      entityLabel: wc.code,
      action: "UPDATE",
      before: snapshot(before),
      after: snapshot(wc),
      summary: `${isActive ? "Reactivated" : "Deactivated"} work center ${wc.code}`,
    });
    return wc;
  });
}

/** Hard delete; throws `InUseError` ("Used by …") when a machine or routing step still references the row. */
export async function deleteWorkCenter(db: TenantDb, session: Session, id: string): Promise<void> {
  const ctx = await auditContext(session);
  await db.$transaction(async (tx) => {
    const wc = await tx.workCenter.findUnique({ where: { id } });
    if (!wc) throw new NotFoundError("Work center not found.");
    const usage = await workCenterUsage(tx, id);
    if (usage.machines > 0 || usage.operations > 0) {
      throw new InUseError(`${describeUsage(usage)}. Deactivate it instead.`);
    }
    await tx.workCenter.delete({ where: { id } });
    await audit(tx, ctx, {
      entityType: "WorkCenter",
      entityId: wc.id,
      entityLabel: wc.code,
      action: "DELETE",
      before: snapshot(wc),
      summary: `Deleted work center ${wc.code} (${wc.name})`,
    });
  });
}
