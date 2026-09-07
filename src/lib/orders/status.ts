/**
 * Order status machine (docs/M1_SPEC.md §4 "Orders").
 *
 *   QUEUED      → IN_PROGRESS | ON_HOLD | CANCELLED
 *   IN_PROGRESS → ON_HOLD | COMPLETED | CANCELLED
 *   ON_HOLD     → QUEUED | IN_PROGRESS | CANCELLED
 *   COMPLETED / CANCELLED are terminal, except ADMIN may reopen COMPLETED → IN_PROGRESS and CANCELLED → QUEUED.
 *
 * CANCELLED requires `orders:cancel`; every other transition requires `orders:status`; reopening requires ADMIN.
 * ON_HOLD requires a reason; CANCELLED accepts an optional one. `completedAt` is set on COMPLETED and cleared on reopen.
 */
import type { OrderPriority, OrderStatus, Role } from "@/generated/prisma/enums";
import { can } from "@/lib/rbac";

export const ORDER_STATUSES = ["QUEUED", "IN_PROGRESS", "ON_HOLD", "COMPLETED", "CANCELLED"] as const satisfies readonly OrderStatus[];

export const TERMINAL_STATUSES = ["COMPLETED", "CANCELLED"] as const satisfies readonly OrderStatus[];

export const ORDER_PRIORITIES = ["LOW", "NORMAL", "HIGH", "URGENT"] as const satisfies readonly OrderPriority[];

export const STATUS_LABELS: Record<OrderStatus, string> = {
  QUEUED: "Queued",
  IN_PROGRESS: "In progress",
  ON_HOLD: "On hold",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

export const PRIORITY_LABELS: Record<OrderPriority, string> = {
  LOW: "Low",
  NORMAL: "Normal",
  HIGH: "High",
  URGENT: "Urgent",
};

/** Non-reopen transitions available to holders of `orders:status` / `orders:cancel`. */
const TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  QUEUED: ["IN_PROGRESS", "ON_HOLD", "CANCELLED"],
  IN_PROGRESS: ["ON_HOLD", "COMPLETED", "CANCELLED"],
  ON_HOLD: ["QUEUED", "IN_PROGRESS", "CANCELLED"],
  COMPLETED: [],
  CANCELLED: [],
};

/** ADMIN-only reopen transitions out of a terminal state. */
const REOPEN: Partial<Record<OrderStatus, OrderStatus>> = {
  COMPLETED: "IN_PROGRESS",
  CANCELLED: "QUEUED",
};

export function isOrderStatus(v: unknown): v is OrderStatus {
  return typeof v === "string" && (ORDER_STATUSES as readonly string[]).includes(v);
}

export function isTerminal(status: OrderStatus): boolean {
  return (TERMINAL_STATUSES as readonly string[]).includes(status);
}

/** True when `from → to` is a reopen (terminal → active). */
export function isReopen(from: OrderStatus, to: OrderStatus): boolean {
  return REOPEN[from] === to;
}

/** Whether `role` may move an order from `from` to `to`. Same-status "transitions" are never allowed. */
export function canTransition(from: OrderStatus, to: OrderStatus, role: Role): boolean {
  if (from === to) return false;
  if (!isOrderStatus(from) || !isOrderStatus(to)) return false;
  if (isTerminal(from)) {
    return REOPEN[from] === to && role === "ADMIN";
  }
  if (!TRANSITIONS[from].includes(to)) return false;
  return to === "CANCELLED" ? can(role, "orders:cancel") : can(role, "orders:status");
}

/** Legal targets for a status dialog, in canonical status order. */
export function allowedTargets(from: OrderStatus, role: Role): OrderStatus[] {
  return ORDER_STATUSES.filter((to) => canTransition(from, to, role));
}

/** ON_HOLD requires a reason. */
export function transitionRequiresReason(to: OrderStatus): boolean {
  return to === "ON_HOLD";
}

/** ON_HOLD and CANCELLED carry a reason (required / optional). */
export function transitionAcceptsReason(to: OrderStatus): boolean {
  return to === "ON_HOLD" || to === "CANCELLED";
}

/** COMPLETED and CANCELLED are confirmed via ConfirmDialog (docs/M1_SPEC.md §6.1). */
export function transitionNeedsConfirmation(to: OrderStatus): boolean {
  return isTerminal(to);
}

export const ORDER_EDITABLE_FIELDS = [
  "customerId",
  "productId",
  "orderNumber",
  "quantity",
  "priority",
  "dueDate",
  "earliestStartDate",
  "customerPoRef",
  "notes",
] as const;

export type OrderEditableField = (typeof ORDER_EDITABLE_FIELDS)[number];

const LOCKED_AFTER_QUEUED: readonly OrderEditableField[] = ["customerId", "productId", "orderNumber"];

/**
 * Fields still editable for an order in `status`: everything while QUEUED; identity fields lock once the order has
 * started; only `notes` in a terminal state.
 */
export function editableFields(status: OrderStatus): Set<OrderEditableField> {
  if (isTerminal(status)) return new Set<OrderEditableField>(["notes"]);
  if (status === "QUEUED") return new Set<OrderEditableField>(ORDER_EDITABLE_FIELDS);
  return new Set<OrderEditableField>(ORDER_EDITABLE_FIELDS.filter((f) => !LOCKED_AFTER_QUEUED.includes(f)));
}

export function isFieldEditable(status: OrderStatus, field: OrderEditableField): boolean {
  return editableFields(status).has(field);
}

/** Audit summary text: `Order SO-000123 status IN_PROGRESS → COMPLETED`. */
export function transitionSummary(orderNumber: string, from: OrderStatus, to: OrderStatus): string {
  return `Order ${orderNumber} status ${from} → ${to}`;
}

/** What a transition does to `completedAt`: set now on COMPLETED, clear on reopen, otherwise leave unchanged. */
export function completedAtFor(from: OrderStatus, to: OrderStatus, now: Date = new Date()): Date | null | undefined {
  if (to === "COMPLETED") return now;
  if (isReopen(from, to)) return null;
  return undefined;
}
