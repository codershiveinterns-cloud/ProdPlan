/**
 * Typed builders for every notification event in docs/M2_SPEC.md §5. Each returns a `NotificationInput` for
 * `notify(tx, input)` — recipients, title/body, href and dedupe key are decided HERE so call sites stay one line:
 *
 *   await notify(tx, orderStatusChanged({ tenantId, actorUserId: session.user.id, actorName: session.user.name,
 *                                         orderId, orderNumber, from: "QUEUED", to: "ON_HOLD" }));
 *
 * Pure (no I/O); unit-tested in tests/unit/notifications-events.test.ts.
 */
import type { ConflictType, DeliveryRisk, OperationStatus, OrderStatus } from "@/generated/prisma/enums";
import { STATUS_LABELS } from "@/lib/orders/status";
import type { NotificationInput } from "./service";

/** Common fields every event carries. */
export type EventBase = {
  tenantId: string;
  /** The acting user; excluded from the recipients. `null` for system/background runs. */
  actorUserId?: string | null;
};

export const PLANNING_ROLES = ["ADMIN", "PLANNER"] as const;

/** Display name for a user who triggered a change ("Priya"), falling back to "Someone". */
function actorLabel(name: string | null | undefined): string {
  const trimmed = name?.trim();
  return trimmed ? trimmed : "Someone";
}

function plural(n: number, singular: string, pluralForm = `${singular}s`): string {
  return `${n} ${n === 1 ? singular : pluralForm}`;
}

// ---------------------------------------------------------------------------------------------------------------
// Dedupe keys (exported so the scheduling engine can reason about them, e.g. when resolving conflicts)
// ---------------------------------------------------------------------------------------------------------------

export const SCHEDULE_RUN_DEDUPE_KEY = "schedule:run";

/** `conflict:<type>:<orderId|machineId|materialId>` — the spec's key for conflicts and material shortages. */
export function conflictDedupeKey(type: ConflictType, subjectId: string): string {
  return `conflict:${type}:${subjectId}`;
}

/** `risk:<orderId>:<risk>`. */
export function riskDedupeKey(orderId: string, risk: DeliveryRisk): string {
  return `risk:${orderId}:${risk}`;
}

/** `order-status:<orderId>:<status>` — collapses repeated flips to the same status. */
export function orderStatusDedupeKey(orderId: string, status: OrderStatus): string {
  return `order-status:${orderId}:${status}`;
}

/** `operation:<entryId>:<status>` — "dedupe per entry+status". */
export function operationStatusDedupeKey(entryId: string, status: OperationStatus): string {
  return `operation:${entryId}:${status}`;
}

// ---------------------------------------------------------------------------------------------------------------
// Hrefs
// ---------------------------------------------------------------------------------------------------------------

export const HREFS = {
  schedule: "/schedule",
  conflicts: "/schedule/conflicts",
  floor: "/floor",
  order: (orderId: string) => `/orders/${orderId}`,
} as const;

// ---------------------------------------------------------------------------------------------------------------
// Builders
// ---------------------------------------------------------------------------------------------------------------

export type ScheduleRunFinishedEvent = EventBase & {
  runId?: string | null;
  /** Orders placed by the run. */
  orderCount: number;
  /** Open conflicts after the run. */
  conflictCount: number;
};

/** "Schedule updated — 18 orders, 3 conflicts" → ADMIN + PLANNER → /schedule. */
export function scheduleRunFinished(e: ScheduleRunFinishedEvent): NotificationInput {
  return {
    tenantId: e.tenantId,
    recipients: { roles: [...PLANNING_ROLES] },
    type: "SCHEDULE_RUN",
    title: "Schedule updated",
    body: `${plural(e.orderCount, "order")} scheduled, ${plural(e.conflictCount, "conflict")}`,
    href: HREFS.schedule,
    entityType: "ScheduleRun",
    entityId: e.runId ?? null,
    // Unread "Schedule updated" rows collapse into one (bumped, with the latest counts) within 24 h.
    dedupeKey: SCHEDULE_RUN_DEDUPE_KEY,
    excludeUserId: e.actorUserId ?? null,
  };
}

export type ConflictSubject =
  | { orderId: string; orderNumber: string }
  | { machineId: string; machineCode: string }
  | { materialId: string; materialCode: string };

export type ConflictDetectedEvent = EventBase & {
  conflictId?: string | null;
  conflictType: ConflictType;
  /** The order / machine / material the conflict is about — also the dedupe subject. */
  subject: ConflictSubject;
  /** Human sentence from the engine ("CNC-01 is overloaded on 12 Sep by 3 h"). */
  message: string;
};

const CONFLICT_TITLES: Record<ConflictType, string> = {
  MACHINE_OVERLOAD: "Machine overloaded",
  MACHINE_UNAVAILABLE: "Machine unavailable",
  MATERIAL_SHORTAGE: "Material shortage",
  DEADLINE_AT_RISK: "Deadline at risk",
  DEADLINE_MISSED: "Deadline missed",
  NO_ROUTING: "No routing",
  NO_MACHINE: "No machine available",
  UNSCHEDULED: "Order unscheduled",
};

function subjectId(s: ConflictSubject): string {
  if ("orderId" in s) return s.orderId;
  if ("machineId" in s) return s.machineId;
  return s.materialId;
}

function subjectLabel(s: ConflictSubject): string {
  if ("orderId" in s) return s.orderNumber;
  if ("machineId" in s) return s.machineCode;
  return s.materialCode;
}

function subjectEntityType(s: ConflictSubject): string {
  if ("orderId" in s) return "Order";
  if ("machineId" in s) return "Machine";
  return "Material";
}

/** A new CRITICAL conflict → ADMIN + PLANNER → /schedule/conflicts, dedupe `conflict:<type>:<subjectId>`. */
export function conflictDetected(e: ConflictDetectedEvent): NotificationInput {
  return {
    tenantId: e.tenantId,
    recipients: { roles: [...PLANNING_ROLES] },
    type: e.conflictType === "MATERIAL_SHORTAGE" ? "MATERIAL_SHORTAGE" : "SCHEDULE_CONFLICT",
    title: `${CONFLICT_TITLES[e.conflictType]}: ${subjectLabel(e.subject)}`,
    body: e.message,
    href: HREFS.conflicts,
    entityType: subjectEntityType(e.subject),
    entityId: subjectId(e.subject),
    dedupeKey: conflictDedupeKey(e.conflictType, subjectId(e.subject)),
    excludeUserId: e.actorUserId ?? null,
  };
}

export type MaterialShortageEvent = EventBase & {
  materialId: string;
  materialCode: string;
  materialName: string;
  /** Pre-formatted shortfall ("12.5 kg") — formatted by the caller with formatQty(); optional. */
  shortfall?: string | null;
  /** Orders affected (order numbers), optional. */
  orderNumbers?: readonly string[];
};

/** A MATERIAL_SHORTAGE conflict → ADMIN + PLANNER → /schedule/conflicts, dedupe `conflict:MATERIAL_SHORTAGE:<materialId>`. */
export function materialShortage(e: MaterialShortageEvent): NotificationInput {
  const parts: string[] = [];
  if (e.shortfall) parts.push(`Short by ${e.shortfall}`);
  if (e.orderNumbers && e.orderNumbers.length > 0) {
    parts.push(e.orderNumbers.length === 1 ? `affects ${e.orderNumbers[0]}` : `affects ${plural(e.orderNumbers.length, "order")}`);
  }
  const body = parts.length > 0 ? parts.join(", ") : "Not enough stock to cover the scheduled orders";
  return {
    tenantId: e.tenantId,
    recipients: { roles: [...PLANNING_ROLES] },
    type: "MATERIAL_SHORTAGE",
    title: `Material shortage: ${e.materialCode} ${e.materialName}`.trim(),
    body,
    href: HREFS.conflicts,
    entityType: "Material",
    entityId: e.materialId,
    dedupeKey: conflictDedupeKey("MATERIAL_SHORTAGE", e.materialId),
    excludeUserId: e.actorUserId ?? null,
  };
}

export type DeliveryRiskChangedEvent = EventBase & {
  orderId: string;
  orderNumber: string;
  risk: DeliveryRisk;
  /** Pre-formatted due date ("12 Sep 2026"), optional. */
  dueDate?: string | null;
  /** Pre-formatted projected completion ("14 Sep 2026, 16:30"), optional. */
  projectedEnd?: string | null;
};

/** Risks that produce a notification; ON_TRACK never does. */
export const NOTIFIED_RISKS = ["AT_RISK", "DELAYED", "LATE"] as const satisfies readonly DeliveryRisk[];

const RISK_TITLES: Record<DeliveryRisk, string> = {
  ON_TRACK: "On track",
  AT_RISK: "at risk",
  DELAYED: "delayed",
  LATE: "late",
};

/**
 * deliveryRisk changed to AT_RISK / DELAYED / LATE → ADMIN + PLANNER → /orders/:id, dedupe `risk:<orderId>:<risk>`.
 * Returns `null` for ON_TRACK (nothing to notify), so callers can `if (input) await notify(tx, input)`.
 */
export function deliveryRiskChanged(e: DeliveryRiskChangedEvent): NotificationInput | null {
  if (!(NOTIFIED_RISKS as readonly DeliveryRisk[]).includes(e.risk)) return null;
  const details: string[] = [];
  if (e.dueDate) details.push(`Due ${e.dueDate}`);
  if (e.projectedEnd) details.push(`projected ${e.projectedEnd}`);
  return {
    tenantId: e.tenantId,
    recipients: { roles: [...PLANNING_ROLES] },
    type: "DELIVERY_RISK",
    title: `Order ${e.orderNumber} is ${RISK_TITLES[e.risk]}`,
    body: details.length > 0 ? details.join(", ") : "The current schedule does not meet the due date",
    href: HREFS.order(e.orderId),
    entityType: "Order",
    entityId: e.orderId,
    dedupeKey: riskDedupeKey(e.orderId, e.risk),
    excludeUserId: e.actorUserId ?? null,
  };
}

export type OrderStatusChangedEvent = EventBase & {
  actorName?: string | null;
  orderId: string;
  orderNumber: string;
  from: OrderStatus;
  to: OrderStatus;
  reason?: string | null;
};

/** Statuses that also notify SUPERVISORs (they run the floor). */
export const SUPERVISOR_ORDER_STATUSES = ["ON_HOLD", "IN_PROGRESS"] as const satisfies readonly OrderStatus[];

/**
 * Order status changed → ADMIN + PLANNER (+ SUPERVISOR for ON_HOLD / IN_PROGRESS) → /orders/:id. "Made by someone
 * else" is guaranteed by `excludeUserId`; dedupe `order-status:<orderId>:<to>`.
 */
export function orderStatusChanged(e: OrderStatusChangedEvent): NotificationInput {
  const roles = (SUPERVISOR_ORDER_STATUSES as readonly OrderStatus[]).includes(e.to)
    ? [...PLANNING_ROLES, "SUPERVISOR" as const]
    : [...PLANNING_ROLES];
  const reason = e.reason?.trim();
  const body = `${actorLabel(e.actorName)} changed it from ${STATUS_LABELS[e.from].toLowerCase()}${reason ? ` — ${reason}` : ""}`;
  return {
    tenantId: e.tenantId,
    recipients: { roles },
    type: "ORDER_STATUS",
    title: `Order ${e.orderNumber} is now ${STATUS_LABELS[e.to].toLowerCase()}`,
    body,
    href: HREFS.order(e.orderId),
    entityType: "Order",
    entityId: e.orderId,
    dedupeKey: orderStatusDedupeKey(e.orderId, e.to),
    excludeUserId: e.actorUserId ?? null,
  };
}

export type OperationStatusChangedEvent = EventBase & {
  actorName?: string | null;
  /** ScheduleEntry id (the dedupe subject). */
  entryId: string;
  orderId: string;
  orderNumber: string;
  /** Routing step name ("Cutting"). */
  operationName: string;
  machineCode?: string | null;
  status: OperationStatus;
};

const OPERATION_VERBS: Record<OperationStatus, string> = {
  QUEUED: "queued",
  IN_PROGRESS: "started",
  ON_HOLD: "paused",
  COMPLETED: "completed",
  SKIPPED: "skipped",
};

/** Operation started / completed / paused → ADMIN + PLANNER → /floor, dedupe `operation:<entryId>:<status>`. */
export function operationStatusChanged(e: OperationStatusChangedEvent): NotificationInput {
  const where = e.machineCode ? ` on ${e.machineCode}` : "";
  return {
    tenantId: e.tenantId,
    recipients: { roles: [...PLANNING_ROLES] },
    type: "OPERATION_STATUS",
    title: `${e.operationName} ${OPERATION_VERBS[e.status]}: ${e.orderNumber}`,
    body: `${actorLabel(e.actorName)} ${OPERATION_VERBS[e.status]} ${e.operationName}${where} for order ${e.orderNumber}`,
    href: HREFS.floor,
    entityType: "ScheduleEntry",
    entityId: e.entryId,
    dedupeKey: operationStatusDedupeKey(e.entryId, e.status),
    excludeUserId: e.actorUserId ?? null,
  };
}
