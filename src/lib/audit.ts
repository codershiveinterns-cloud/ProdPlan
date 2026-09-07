/**
 * Audit contract — docs/M1_SPEC.md §4 "Audit contract".
 *
 * `audit(tx, ctx, input)` MUST be called with the SAME tenant-scoped client / transaction as the mutation it
 * describes. It snapshots the actor, redacts sensitive keys from before/after, computes `changedFields` and inserts
 * one append-only AuditLog row. `auditContext(session)` builds the ctx from the session + request headers.
 * `describeAudit(row)` renders a row for activity feeds.
 *
 * Server-only: `auditContext()` imports `next/headers`. Do not import this module from Client Components.
 */
import { headers } from "next/headers";
import type { Prisma } from "@/generated/prisma/client";
import type { AuditAction } from "@/generated/prisma/enums";
import type { TenantDb, TenantTx } from "@/lib/db";
import { toPlain } from "@/lib/serialize";

/** Structural subset of UserDTO (src/lib/auth/user-dto.ts) that audit needs. Any UserDTO satisfies it. */
export type AuditActor = {
  id: string;
  email: string;
  name: string;
  tenantId?: string;
};

export type AuditCtx = {
  actor: AuditActor | null;
  ip?: string | null;
  userAgent?: string | null;
};

export type AuditInput = {
  entityType: string;
  entityId: string;
  entityLabel?: string | null;
  action: AuditAction;
  before?: unknown;
  after?: unknown;
  summary: string;
};

/** Keys removed from before/after snapshots at any depth. */
export const REDACTED_KEY_PATTERN = /password|secret|token/i;
const ALWAYS_REDACTED: ReadonlySet<string> = new Set(["updatedAt"]);

const MAX_USER_AGENT = 512;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object") return false;
  const proto: unknown = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function redactDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactDeep);
  if (!isPlainObject(value)) return value;
  const out: Record<string, unknown> = {};
  for (const [key, inner] of Object.entries(value)) {
    if (ALWAYS_REDACTED.has(key) || REDACTED_KEY_PATTERN.test(key)) continue;
    out[key] = redactDeep(inner);
  }
  return out;
}

/** JSON-safe (Decimal → number, Date → ISO) and redacted copy of a snapshot; `undefined` stays `undefined`. */
export function redactSnapshot(value: unknown): unknown {
  if (value === undefined) return undefined;
  return redactDeep(toPlain(value));
}

function stableStringify(value: unknown): string {
  if (value === undefined) return "undefined";
  return JSON.stringify(value, (_key, v: unknown) => {
    if (isPlainObject(v)) {
      return Object.keys(v)
        .sort()
        .reduce<Record<string, unknown>>((acc, k) => {
          acc[k] = v[k];
          return acc;
        }, {});
    }
    return v;
  });
}

/** Shallow diff: keys (union of both snapshots) whose values differ. Empty unless both are plain objects. */
export function changedFields(before: unknown, after: unknown): string[] {
  if (!isPlainObject(before) || !isPlainObject(after)) return [];
  const keys = new Set([...Object.keys(after), ...Object.keys(before)]);
  const changed: string[] = [];
  for (const key of keys) {
    if (stableStringify(before[key]) !== stableStringify(after[key])) changed.push(key);
  }
  return changed;
}

function readTenantId(tx: TenantTx | TenantDb, actor: AuditActor | null): string {
  const scoped = (tx as { $tenantId?: unknown }).$tenantId;
  if (typeof scoped === "string" && scoped) return scoped;
  // The scoped client overwrites tenantId anyway; this only satisfies the TS input type.
  return actor?.tenantId ?? "";
}

/**
 * Writes one AuditLog row through the scoped client/transaction. Append-only (the scoped client rejects
 * update/delete on AuditLog).
 */
export async function audit(tx: TenantTx | TenantDb, ctx: AuditCtx, input: AuditInput): Promise<void> {
  const before = redactSnapshot(input.before);
  const after = redactSnapshot(input.after);
  const fields = changedFields(before, after);
  const actor = ctx.actor;

  await tx.auditLog.create({
    data: {
      tenantId: readTenantId(tx, actor),
      actorUserId: actor?.id ?? null,
      actorEmail: actor?.email ?? null,
      actorName: actor?.name ?? null,
      ip: ctx.ip ?? null,
      userAgent: ctx.userAgent ? ctx.userAgent.slice(0, MAX_USER_AGENT) : null,
      entityType: input.entityType,
      entityId: input.entityId,
      entityLabel: input.entityLabel ?? null,
      action: input.action,
      summary: input.summary,
      changedFields: fields,
      // Redacted snapshots are plain JSON (toPlain + redactDeep); null/undefined are stored as SQL NULL.
      before: before == null ? undefined : (before as Prisma.InputJsonValue),
      after: after == null ? undefined : (after as Prisma.InputJsonValue),
    },
  });
}

/** Client IP per spec §3: Netlify header first, else the last hop of x-forwarded-for. */
export function clientIpFromHeaders(h: Headers): string | null {
  const netlify = h.get("x-nf-client-connection-ip")?.trim();
  if (netlify) return netlify;
  const forwarded = h.get("x-forwarded-for");
  if (forwarded) {
    const hops = forwarded
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (hops.length > 0) return hops[hops.length - 1];
  }
  return null;
}

/**
 * Builds the audit ctx for the current request: actor from the session, ip/userAgent from `headers()`.
 * Works outside a request scope too (ip/userAgent become null), e.g. in scripts.
 */
export async function auditContext(session: { user: AuditActor | null } | null | undefined): Promise<AuditCtx> {
  let ip: string | null = null;
  let userAgent: string | null = null;
  try {
    const h = await headers();
    ip = clientIpFromHeaders(h);
    userAgent = h.get("user-agent")?.slice(0, MAX_USER_AGENT) ?? null;
  } catch {
    // headers() throws outside a request scope (seed scripts, tests) — audit without request metadata.
  }
  return { actor: session?.user ?? null, ip, userAgent };
}

// ---------------------------------------------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------------------------------------------

/** The subset of an AuditLog row (raw or toPlain()-ed) that describeAudit() needs. */
export type AuditRowLike = {
  action: AuditAction;
  entityType: string;
  entityId: string;
  entityLabel?: string | null;
  actorName?: string | null;
  actorEmail?: string | null;
  changedFields?: string[] | null;
};

const ENTITY_NOUNS: Readonly<Record<string, string>> = {
  Order: "Order",
  Customer: "Customer",
  Product: "Product",
  ProductOperation: "Routing step",
  Material: "Material",
  BomItem: "BOM item",
  StockMovement: "Stock movement",
  WorkCenter: "Work center",
  Machine: "Machine",
  DowntimeWindow: "Downtime window",
  ShiftCalendar: "Shift calendar",
  Shift: "Shift",
  CalendarException: "Calendar exception",
  User: "User",
  Tenant: "Plant settings",
  ImportBatch: "CSV import",
  DemoData: "Demo data",
};

const VERBS: Readonly<Record<AuditAction, string>> = {
  CREATE: "created",
  UPDATE: "updated",
  DELETE: "deleted",
  STATUS_CHANGE: "changed status of",
  IMPORT: "imported",
  LOGIN: "signed in",
};

const DETAIL_ROUTES: Readonly<Record<string, (id: string) => string>> = {
  Order: (id) => `/orders/${id}`,
  Customer: (id) => `/customers/${id}`,
  Product: (id) => `/products/${id}`,
  Material: (id) => `/materials/${id}`,
  Machine: (id) => `/machines/${id}`,
  ShiftCalendar: (id) => `/calendars/${id}`,
  ImportBatch: (id) => `/orders?batch=${encodeURIComponent(id)}&status=all`,
};

/** Where a row links when the entity itself has no detail page (children, deletions). */
const LIST_ROUTES: Readonly<Record<string, string>> = {
  Order: "/orders",
  Customer: "/customers",
  Product: "/products",
  ProductOperation: "/products",
  BomItem: "/products",
  Material: "/materials",
  StockMovement: "/materials",
  Machine: "/machines",
  DowntimeWindow: "/machines",
  WorkCenter: "/work-centers",
  ShiftCalendar: "/calendars",
  Shift: "/calendars",
  CalendarException: "/calendars",
  User: "/settings/users",
  ImportBatch: "/orders",
};

function entityNoun(entityType: string): string {
  return ENTITY_NOUNS[entityType] ?? entityType.replace(/([a-z0-9])([A-Z])/g, "$1 $2");
}

/** Href for an audit row: detail page when it exists and the entity still exists, else the list page; null for Tenant. */
export function auditHref(row: Pick<AuditRowLike, "action" | "entityType" | "entityId">): string | null {
  if (row.entityType === "Tenant") return null;
  if (row.action === "LOGIN") return null;
  if (row.action !== "DELETE") {
    const detail = DETAIL_ROUTES[row.entityType];
    if (detail) return detail(row.entityId);
  }
  return LIST_ROUTES[row.entityType] ?? null;
}

/** "Priya updated Order SO-000123 (dueDate, priority)" + link target. */
export function describeAudit(row: AuditRowLike): { text: string; href: string | null } {
  const actor = row.actorName?.trim() || row.actorEmail?.trim() || "System";
  const verb = VERBS[row.action] ?? String(row.action).toLowerCase();
  const href = auditHref(row);

  if (row.action === "LOGIN") return { text: `${actor} ${verb}`, href };

  const label = row.entityLabel?.trim();
  const parts = [actor, verb, entityNoun(row.entityType)];
  if (label) parts.push(label);
  let text = parts.join(" ");
  const fields = row.changedFields ?? [];
  if (row.action === "UPDATE" && fields.length > 0) text += ` (${fields.join(", ")})`;
  return { text, href };
}
