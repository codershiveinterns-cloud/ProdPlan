/**
 * Audit log list query (docs/M3_SPEC.md §9), following the same shape as `src/lib/orders/list.ts`
 * (parseParams / whereClause / query functions) so Engineer D can build the CSV/PDF export (§8) on top of this
 * module's `auditLogListWhere()`/`auditLogListOrderBy()` without re-deriving the filter logic.
 *
 * List URL contract (docs/M1_SPEC.md §5): `q`, `page` (1-based, 25/page), plus module filters `entityType`,
 * `action`, `actorId`, `from`, `to` (calendar dates, tenant timezone).
 */
import type { AuditAction } from "@/generated/prisma/enums";
import type { AuditLogOrderByWithRelationInput, AuditLogWhereInput } from "@/generated/prisma/models";
import { endOfDayInTz, isIsoDate, startOfDayInTz } from "@/lib/dates";
import type { TenantDb } from "@/lib/db";

export const AUDIT_LOG_PAGE_SIZE = 25;

export const AUDIT_ACTIONS = ["CREATE", "UPDATE", "DELETE", "STATUS_CHANGE", "IMPORT", "LOGIN"] as const satisfies readonly AuditAction[];

type SearchParams = Record<string, string | string[] | undefined>;

function first(v: string | string[] | undefined): string {
  return (Array.isArray(v) ? v[0] : v) ?? "";
}

function idParam(v: string): string {
  const s = v.trim();
  return /^[A-Za-z0-9_-]{1,64}$/.test(s) ? s : "";
}

function entityTypeParam(v: string): string {
  const s = v.trim();
  return /^[A-Za-z][A-Za-z0-9]{0,40}$/.test(s) ? s : "";
}

function dateParam(v: string): string {
  const s = v.trim();
  return isIsoDate(s) ? s : "";
}

export type AuditLogListParams = {
  q: string;
  page: number;
  entityType: string;
  action: AuditAction | "";
  actorId: string;
  /** `YYYY-MM-DD` or "". */
  from: string;
  to: string;
};

export function parseAuditLogListParams(sp: SearchParams): AuditLogListParams {
  const q = first(sp.q).trim().slice(0, 120);
  const pageRaw = Number.parseInt(first(sp.page), 10);
  const page = Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1;
  const actionRaw = first(sp.action).trim().toUpperCase();
  const action = (AUDIT_ACTIONS as readonly string[]).includes(actionRaw) ? (actionRaw as AuditAction) : "";
  return {
    q,
    page,
    entityType: entityTypeParam(first(sp.entityType)),
    action,
    actorId: idParam(first(sp.actorId)),
    from: dateParam(first(sp.from)),
    to: dateParam(first(sp.to)),
  };
}

/** Query string (with leading `?`, or "" when everything is default) for `/settings/audit` links. */
export function auditLogListQuery(params: Partial<AuditLogListParams>): string {
  const sp = new URLSearchParams();
  if (params.q) sp.set("q", params.q);
  if (params.entityType) sp.set("entityType", params.entityType);
  if (params.action) sp.set("action", params.action);
  if (params.actorId) sp.set("actorId", params.actorId);
  if (params.from) sp.set("from", params.from);
  if (params.to) sp.set("to", params.to);
  if (params.page && params.page > 1) sp.set("page", String(params.page));
  const s = sp.toString();
  return s ? `?${s}` : "";
}

/** Number of module filters that differ from their defaults (q is counted separately by callers, as elsewhere). */
export function countActiveAuditLogFilters(params: AuditLogListParams): number {
  let n = 0;
  if (params.entityType) n++;
  if (params.action) n++;
  if (params.actorId) n++;
  if (params.from) n++;
  if (params.to) n++;
  return n;
}

/** `tz` (tenant timezone) turns `from`/`to` calendar dates into a UTC instant range for `createdAt`. */
export function auditLogListWhere(params: AuditLogListParams, tz: string): AuditLogWhereInput {
  const and: AuditLogWhereInput[] = [];
  if (params.entityType) and.push({ entityType: params.entityType });
  if (params.action) and.push({ action: params.action });
  if (params.actorId) and.push({ actorUserId: params.actorId });
  if (params.from) and.push({ createdAt: { gte: startOfDayInTz(params.from, tz) } });
  if (params.to) and.push({ createdAt: { lte: endOfDayInTz(params.to, tz) } });
  if (params.q) {
    const contains = { contains: params.q, mode: "insensitive" as const };
    and.push({
      OR: [
        { summary: contains },
        { entityLabel: contains },
        { entityId: contains },
        { actorName: contains },
        { actorEmail: contains },
      ],
    });
  }
  return and.length > 0 ? { AND: and } : {};
}

export function auditLogListOrderBy(): AuditLogOrderByWithRelationInput[] {
  return [{ createdAt: "desc" }, { id: "desc" }];
}

/** Plain row DTO for the audit log table (dates as ISO strings, before/after kept as-is — already redacted at write time). */
export type AuditLogListRow = {
  id: string;
  createdAt: string;
  actorUserId: string | null;
  actorEmail: string | null;
  actorName: string | null;
  entityType: string;
  entityId: string;
  entityLabel: string | null;
  action: AuditAction;
  summary: string;
  changedFields: string[];
  before: unknown;
  after: unknown;
};

export const auditLogListSelect = {
  id: true,
  createdAt: true,
  actorUserId: true,
  actorEmail: true,
  actorName: true,
  entityType: true,
  entityId: true,
  entityLabel: true,
  action: true,
  summary: true,
  changedFields: true,
  before: true,
  after: true,
} as const;

type AuditLogListRecord = {
  id: string;
  createdAt: Date;
  actorUserId: string | null;
  actorEmail: string | null;
  actorName: string | null;
  entityType: string;
  entityId: string;
  entityLabel: string | null;
  action: AuditAction;
  summary: string;
  changedFields: string[];
  before: unknown;
  after: unknown;
};

export function toAuditLogListRow(row: AuditLogListRecord): AuditLogListRow {
  return {
    id: row.id,
    createdAt: row.createdAt.toISOString(),
    actorUserId: row.actorUserId,
    actorEmail: row.actorEmail,
    actorName: row.actorName,
    entityType: row.entityType,
    entityId: row.entityId,
    entityLabel: row.entityLabel,
    action: row.action,
    summary: row.summary,
    changedFields: row.changedFields,
    before: row.before,
    after: row.after,
  };
}

/** Active users for the "Actor" filter select, name-sorted. */
export async function listAuditActorOptions(db: TenantDb): Promise<{ id: string; name: string }[]> {
  return db.user.findMany({
    where: { isActive: true },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
}

/**
 * Paginated audit log query (docs/M3_SPEC.md §9). `db` must be a client scoped for `audit:read-all` — the page
 * (and any future export route) is responsible for calling `requirePermission("audit:read-all")` first; this
 * function itself performs no permission check.
 */
export async function listAuditLog(
  db: TenantDb,
  params: AuditLogListParams,
  tz: string,
): Promise<{ rows: AuditLogListRow[]; total: number }> {
  const where = auditLogListWhere(params, tz);
  const [total, rows] = await Promise.all([
    db.auditLog.count({ where }),
    db.auditLog.findMany({
      where,
      orderBy: auditLogListOrderBy(),
      skip: (params.page - 1) * AUDIT_LOG_PAGE_SIZE,
      take: AUDIT_LOG_PAGE_SIZE,
      select: auditLogListSelect,
    }),
  ]);
  return { total, rows: rows.map(toAuditLogListRow) };
}
