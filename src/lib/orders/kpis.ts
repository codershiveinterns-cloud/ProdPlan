/**
 * Shared order KPI definitions (docs/M1_SPEC.md §6.6) used by the dashboard and the orders list.
 *
 *   open          = status ∈ {QUEUED, IN_PROGRESS, ON_HOLD}
 *   overdue       = open ∧ dueDate < today
 *   due in 7 days = open ∧ today ≤ dueDate ≤ today + 7
 *   in progress   = status = IN_PROGRESS
 *
 * `today` is always `todayInTz(tenant.timezone)`. Prisma `where` fragments are returned so callers compose them with
 * their own filters through the tenant-scoped client.
 */
import type { OrderStatus } from "@/generated/prisma/enums";
import type { DowntimeWindowWhereInput, MaterialWhereInput, OrderWhereInput } from "@/generated/prisma/models";
import { addDays, diffDays, fromDateOnly } from "@/lib/dates";
import { formatDate } from "@/lib/format";
import { isOrderStatus, ORDER_STATUSES } from "@/lib/orders/status";

export const OPEN_STATUSES = ["QUEUED", "IN_PROGRESS", "ON_HOLD"] as const satisfies readonly OrderStatus[];

export const DUE_SOON_DAYS = 7;

export function isOpenStatus(status: OrderStatus): boolean {
  return (OPEN_STATUSES as readonly string[]).includes(status);
}

export function whereOpen(): OrderWhereInput {
  return { status: { in: [...OPEN_STATUSES] } };
}

export function whereOverdue(today: string): OrderWhereInput {
  return { status: { in: [...OPEN_STATUSES] }, dueDate: { lt: fromDateOnly(today) } };
}

export function whereDueWithin(today: string, days: number = DUE_SOON_DAYS): OrderWhereInput {
  return {
    status: { in: [...OPEN_STATUSES] },
    dueDate: { gte: fromDateOnly(today), lte: fromDateOnly(addDays(today, days)) },
  };
}

export function whereInProgress(): OrderWhereInput {
  return { status: "IN_PROGRESS" };
}

/** Downtime windows covering `now` (`startsAt ≤ now < endsAt`). */
export function whereActiveDowntime(now: Date = new Date()): DowntimeWindowWhereInput {
  return { startsAt: { lte: now }, endsAt: { gt: now } };
}

/**
 * Materials at or below their reorder threshold (`isActive ∧ stockOnHand ≤ reorderThreshold`).
 * Comparing two columns needs a Prisma field reference, which only a client instance can provide; pass
 * `db.material.fields.reorderThreshold` to get the exact SQL filter, or omit it and post-filter rows with
 * `isBelowReorder()`.
 */
export function whereBelowReorder(reorderThresholdRef?: unknown): MaterialWhereInput {
  if (reorderThresholdRef === undefined) return { isActive: true };
  // A FieldRef from `db.material.fields.reorderThreshold`; the generated filter type accepts it at runtime.
  return { isActive: true, stockOnHand: { lte: reorderThresholdRef as never } };
}

/** Pure check used with `whereBelowReorder()` rows: `stockOnHand ≤ reorderThreshold`. */
export function isBelowReorder(material: {
  stockOnHand: number | string | { toString(): string };
  reorderThreshold: number | string | { toString(): string };
}): boolean {
  return Number(String(material.stockOnHand)) <= Number(String(material.reorderThreshold));
}

export type StatusFilterMode = "open" | "all" | "custom";

export type ParsedStatusFilter = {
  /** Canonical query-string value to write back into URLs ("open", "all" or a comma list). */
  value: string;
  mode: StatusFilterMode;
  /** Statuses to filter on; null means "all statuses" (no filter). */
  statuses: OrderStatus[] | null;
  where: OrderWhereInput;
};

/**
 * Parses the orders-list `status` param: missing/blank/"open" → open statuses (default); "all" → no filter;
 * otherwise a comma list of statuses (case-insensitive, unknown tokens ignored; nothing valid → default).
 */
export function parseStatusFilter(param: string | string[] | null | undefined): ParsedStatusFilter {
  const raw = (Array.isArray(param) ? param.join(",") : (param ?? "")).trim().toLowerCase();
  if (raw === "" || raw === "open") {
    return { value: "open", mode: "open", statuses: [...OPEN_STATUSES], where: whereOpen() };
  }
  if (raw === "all") {
    return { value: "all", mode: "all", statuses: null, where: {} };
  }
  const tokens = raw
    .split(",")
    .map((t) => t.trim().toUpperCase().replace(/[\s-]+/g, "_"))
    .filter(isOrderStatus);
  const statuses = ORDER_STATUSES.filter((s) => tokens.includes(s));
  if (statuses.length === 0) {
    return { value: "open", mode: "open", statuses: [...OPEN_STATUSES], where: whereOpen() };
  }
  const isOpenSet =
    statuses.length === OPEN_STATUSES.length && statuses.every((s) => (OPEN_STATUSES as readonly string[]).includes(s));
  if (isOpenSet) {
    return { value: "open", mode: "open", statuses, where: whereOpen() };
  }
  if (statuses.length === ORDER_STATUSES.length) {
    return { value: "all", mode: "all", statuses: null, where: {} };
  }
  return { value: statuses.join(","), mode: "custom", statuses, where: { status: { in: statuses } } };
}

export type DueHintKind = "overdue" | "today" | "tomorrow" | "soon" | "later";

export type DueHint = {
  kind: DueHintKind;
  /** Days from today to the due date (negative when overdue). */
  days: number;
  /** Text label: "Overdue 3d", "Due today", "Due tomorrow", "Due in 5d", or the formatted date. */
  label: string;
};

/** Due-date hint per the colour semantics in docs/M1_SPEC.md §5. Both arguments are `YYYY-MM-DD`. */
export function dueHint(due: string, today: string): DueHint {
  const days = diffDays(today, due);
  if (days < 0) return { kind: "overdue", days, label: `Overdue ${-days}d` };
  if (days === 0) return { kind: "today", days, label: "Due today" };
  if (days === 1) return { kind: "tomorrow", days, label: "Due tomorrow" };
  if (days <= DUE_SOON_DAYS) return { kind: "soon", days, label: `Due in ${days}d` };
  return { kind: "later", days, label: formatDate(due) };
}

/** Dashboard tile links must open the identically filtered list. */
export const KPI_LIST_HREFS = {
  open: (): string => "/orders?status=open",
  overdue: (today: string): string => `/orders?status=open&dueTo=${addDays(today, -1)}`,
  dueWithin: (today: string, days: number = DUE_SOON_DAYS): string =>
    `/orders?status=open&dueFrom=${today}&dueTo=${addDays(today, days)}`,
  inProgress: (): string => "/orders?status=IN_PROGRESS",
} as const;
