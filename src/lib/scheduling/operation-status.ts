/**
 * Per-operation status machine and the floor flow (docs/M2_SPEC.md §4).
 *
 *   QUEUED      → IN_PROGRESS | ON_HOLD | SKIPPED (ADMIN/PLANNER)
 *   IN_PROGRESS → ON_HOLD | COMPLETED
 *   ON_HOLD     → QUEUED | IN_PROGRESS
 *   COMPLETED   → IN_PROGRESS (ADMIN/PLANNER reopen)
 *   SKIPPED     → QUEUED (ADMIN/PLANNER reopen)
 *
 * Every transition needs `operations:status`. Starting sets `actualStartAt` once; completing sets `actualEndAt` and
 * `quantityDone` (default = order quantity, ≤ quantity, partial needs a note). A step cannot start before the previous
 * sequence is COMPLETED / SKIPPED unless an ADMIN/PLANNER overrides with a reason. Each change writes one
 * STATUS_CHANGE audit row ("CNC-01 · SO-000118 op 10 started by Ravi"), rolls the order status up, re-assesses the
 * order's delivery risk and marks the schedule dirty when the actual timing deviates > 30 min from the plan.
 *
 * Notifications (docs/M2_SPEC.md §5) are fanned out in the same transaction: every operation status change notifies
 * PLANNER+ADMIN (`operationStatusChanged`, dedupe per entry+status); an order status change performed by the
 * roll-up (a real actor working the floor, not an automatic background job) notifies the same way order-level
 * changes do (`orderStatusChanged`, + SUPERVISOR for ON_HOLD/IN_PROGRESS); a delivery-risk change found by
 * `reassessOrderRisk` notifies for AT_RISK/DELAYED/LATE (`deliveryRiskChanged`, builder returns null for ON_TRACK).
 * The acting user is always excluded from their own notifications.
 */
import type { OperationStatus, OrderStatus, Role } from "@/generated/prisma/enums";
import { audit, type AuditCtx } from "@/lib/audit";
import type { Session } from "@/lib/auth/guards";
import { isWorkingDay, type Calendar } from "@/lib/calendar";
import { addDays, startOfDayInTz, toDateOnly, todayInTz } from "@/lib/dates";
import type { TenantTx } from "@/lib/db";
import { DomainError, ForbiddenError, NotFoundError } from "@/lib/errors";
import { deliveryRiskChanged, operationStatusChanged, orderStatusChanged } from "@/lib/notifications/events";
import { notify } from "@/lib/notifications/service";
import { canTransition, completedAtFor, transitionSummary } from "@/lib/orders/status";
import { can } from "@/lib/rbac";
import { markScheduleDirty, resolveOrderConflicts } from "./dirty";
import { classifyRisk } from "./risk";

export const OPERATION_STATUSES = ["QUEUED", "IN_PROGRESS", "ON_HOLD", "COMPLETED", "SKIPPED"] as const satisfies readonly OperationStatus[];

export const OPERATION_STATUS_LABELS: Record<OperationStatus, string> = {
  QUEUED: "Queued",
  IN_PROGRESS: "In progress",
  ON_HOLD: "On hold",
  COMPLETED: "Completed",
  SKIPPED: "Skipped",
};

/** Actual timing may deviate this much from the plan before the schedule is flagged dirty (spec §4). */
export const DIRTY_DEVIATION_MINUTES = 30;

const TRANSITIONS: Record<OperationStatus, readonly OperationStatus[]> = {
  QUEUED: ["IN_PROGRESS", "ON_HOLD", "SKIPPED"],
  IN_PROGRESS: ["ON_HOLD", "COMPLETED"],
  ON_HOLD: ["QUEUED", "IN_PROGRESS"],
  COMPLETED: ["IN_PROGRESS"],
  SKIPPED: ["QUEUED"],
};

/** Transitions reserved for ADMIN / PLANNER (skip, reopen). */
const PLANNER_ONLY = new Set<string>(["QUEUED>SKIPPED", "COMPLETED>IN_PROGRESS", "SKIPPED>QUEUED"]);

const PLANNER_ROLES: readonly Role[] = ["ADMIN", "PLANNER"];

export function isOperationStatus(v: unknown): v is OperationStatus {
  return typeof v === "string" && (OPERATION_STATUSES as readonly string[]).includes(v);
}

export function isPlannerRole(role: Role): boolean {
  return PLANNER_ROLES.includes(role);
}

/** Whether `role` may move an operation from `from` to `to`. Same-status "transitions" are never allowed. */
export function canTransitionOperation(from: OperationStatus, to: OperationStatus, role: Role): boolean {
  if (from === to) return false;
  if (!isOperationStatus(from) || !isOperationStatus(to)) return false;
  if (!TRANSITIONS[from].includes(to)) return false;
  if (!can(role, "operations:status")) return false;
  if (PLANNER_ONLY.has(`${from}>${to}`)) return isPlannerRole(role);
  return true;
}

/** Legal targets in canonical order. */
export function allowedOperationTargets(from: OperationStatus, role: Role): OperationStatus[] {
  return OPERATION_STATUSES.filter((to) => canTransitionOperation(from, to, role));
}

/** ON_HOLD (pause) needs a reason. */
export function operationTransitionRequiresReason(to: OperationStatus): boolean {
  return to === "ON_HOLD";
}

/** Verb for the audit summary: "started", "paused", "resumed", "completed", "skipped", "reopened", "released". */
export function operationVerb(from: OperationStatus, to: OperationStatus): string {
  switch (to) {
    case "IN_PROGRESS":
      return from === "ON_HOLD" ? "resumed" : from === "COMPLETED" ? "reopened" : "started";
    case "ON_HOLD":
      return "paused";
    case "COMPLETED":
      return "completed";
    case "SKIPPED":
      return "skipped";
    case "QUEUED":
      return from === "SKIPPED" ? "reopened" : "released";
    default:
      return "changed";
  }
}

/** `CNC-01 · SO-000118 op 10 started by Ravi` (+ ` — reason`). */
export function operationSummary(input: { machineCode: string; orderNumber: string; sequence: number; verb: string; actorName: string; reason?: string | null }): string {
  const base = `${input.machineCode} · ${input.orderNumber} op ${input.sequence} ${input.verb} by ${input.actorName}`;
  const reason = input.reason?.trim();
  return reason ? `${base} — ${reason}` : base;
}

/** JSON-safe `holdReason` payload written when an order-level hold pauses its steps. */
export type HeldFrom = { heldFrom: OperationStatus; reason: string | null; orderHold: true };

export function encodeHeldFrom(heldFrom: OperationStatus, reason: string | null): string {
  const payload: HeldFrom = { heldFrom, reason, orderHold: true };
  return JSON.stringify(payload);
}

export function decodeHeldFrom(holdReason: string | null | undefined): HeldFrom | null {
  if (!holdReason || !holdReason.startsWith("{")) return null;
  try {
    const parsed: unknown = JSON.parse(holdReason);
    if (typeof parsed !== "object" || parsed === null) return null;
    const p = parsed as Partial<HeldFrom>;
    if (p.orderHold !== true || !isOperationStatus(p.heldFrom)) return null;
    return { heldFrom: p.heldFrom, reason: typeof p.reason === "string" ? p.reason : null, orderHold: true };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------------------------------------------
// applyOperationTransition
// ---------------------------------------------------------------------------------------------------------------

export type OperationTransitionInput = {
  entryId: string;
  to: OperationStatus;
  quantityDone?: number;
  note?: string | null;
  reason?: string | null;
  /** ADMIN / PLANNER: start although the previous sequence is not done (needs `reason`). */
  overridePrevious?: boolean;
  /** Injectable clock. */
  now?: Date;
};

export type OperationTransitionResult = {
  entryId: string;
  orderId: string;
  orderNumber: string;
  sequence: number;
  machineCode: string;
  from: OperationStatus;
  to: OperationStatus;
  summary: string;
  /** Order roll-up performed by this change (null when the order status did not change). */
  orderStatus: { from: OrderStatus; to: OrderStatus } | null;
  risk: RiskReassessment | null;
  scheduleDirty: boolean;
};

const actorName = (session: Session): string => session.user.name?.trim() || session.user.email;

const num = (v: { toString(): string } | number): number => Number(String(v));

function deviationMinutes(a: Date, b: Date): number {
  return Math.abs(a.getTime() - b.getTime()) / 60_000;
}

export async function applyOperationTransition(
  tx: TenantTx,
  session: Session,
  ctx: AuditCtx,
  input: OperationTransitionInput,
): Promise<OperationTransitionResult> {
  const now = input.now ?? new Date();
  const role = session.user.role;
  const to = input.to;
  const reason = input.reason?.trim() || null;
  const note = input.note?.trim() || null;

  const entry = await tx.scheduleEntry.findUnique({
    where: { id: input.entryId },
    include: {
      order: { select: { id: true, orderNumber: true, quantity: true, status: true } },
      machine: { select: { code: true } },
      workCenter: { select: { name: true } },
    },
  });
  if (!entry) throw new NotFoundError("Operation not found.");
  const from = entry.status;

  if (!canTransitionOperation(from, to, role)) {
    if (canTransitionOperation(from, to, "ADMIN")) throw new ForbiddenError();
    throw new DomainError(`Operation ${entry.order.orderNumber} op ${entry.sequence} cannot go from ${from} to ${to}`, "illegal_transition", 409);
  }
  if (entry.order.status === "COMPLETED" || entry.order.status === "CANCELLED") {
    throw new DomainError(`Order ${entry.order.orderNumber} is ${entry.order.status.toLowerCase()}`, "order_closed", 409);
  }
  if (entry.order.status === "ON_HOLD" && to !== "ON_HOLD") {
    throw new DomainError(`Order ${entry.order.orderNumber} is on hold — release it before working on its operations`, "order_on_hold", 409);
  }
  if (operationTransitionRequiresReason(to) && !reason) {
    throw new DomainError("Give a reason for pausing the operation", "reason_required", 422);
  }

  const data: Parameters<typeof tx.scheduleEntry.update>[0]["data"] = { status: to };
  let dirty = false;

  if (to === "IN_PROGRESS" && from !== "COMPLETED") {
    // Previous-sequence gate.
    const blocking = await tx.scheduleEntry.findFirst({
      where: { orderId: entry.orderId, sequence: { lt: entry.sequence }, status: { notIn: ["COMPLETED", "SKIPPED"] } },
      orderBy: { sequence: "asc" },
      select: { sequence: true, status: true },
    });
    if (blocking) {
      if (!input.overridePrevious) {
        throw new DomainError(`Op ${blocking.sequence} must be completed before op ${entry.sequence} can start`, "previous_step", 409);
      }
      if (!isPlannerRole(role)) throw new ForbiddenError("Only an admin or planner can start a step out of sequence.");
      if (!reason) throw new DomainError("Give a reason for starting this step out of sequence", "reason_required", 422);
    }
    if (entry.actualStartAt === null) {
      data.actualStartAt = now;
      if (deviationMinutes(now, entry.plannedStartAt) > DIRTY_DEVIATION_MINUTES) dirty = true;
    }
    data.holdReason = null;
  }
  if (to === "IN_PROGRESS" && from === "COMPLETED") {
    data.actualEndAt = null;
  }
  if (to === "COMPLETED") {
    const orderQty = num(entry.order.quantity);
    const done = input.quantityDone ?? orderQty;
    if (!Number.isFinite(done) || done < 0) throw new DomainError("Quantity done must be 0 or more", "quantity", 422);
    if (done > orderQty) throw new DomainError(`Quantity done cannot exceed the order quantity (${orderQty})`, "quantity", 422);
    if (done < orderQty && !note) throw new DomainError("Add a note when completing less than the order quantity", "note_required", 422);
    data.quantityDone = done;
    data.actualEndAt = now;
    if (entry.actualStartAt === null) data.actualStartAt = now;
    if (deviationMinutes(now, entry.plannedEndAt) > DIRTY_DEVIATION_MINUTES) dirty = true;
  }
  if (to === "ON_HOLD") data.holdReason = reason;
  if (to === "QUEUED") data.holdReason = null;
  if (note !== null) data.note = note;

  const after = await tx.scheduleEntry.update({ where: { id: entry.id }, data });

  const verb = operationVerb(from, to);
  const summary = operationSummary({
    machineCode: entry.machine.code,
    orderNumber: entry.order.orderNumber,
    sequence: entry.sequence,
    verb,
    actorName: actorName(session),
    reason,
  });
  await audit(tx, ctx, {
    entityType: "ScheduleEntry",
    entityId: entry.id,
    entityLabel: `${entry.order.orderNumber} op ${entry.sequence}`,
    action: "STATUS_CHANGE",
    before: {
      status: from,
      actualStartAt: entry.actualStartAt?.toISOString() ?? null,
      actualEndAt: entry.actualEndAt?.toISOString() ?? null,
      quantityDone: num(entry.quantityDone),
      reason: null,
    },
    after: {
      status: to,
      actualStartAt: after.actualStartAt?.toISOString() ?? null,
      actualEndAt: after.actualEndAt?.toISOString() ?? null,
      quantityDone: num(after.quantityDone),
      reason,
    },
    summary,
  });

  if (dirty) await markScheduleDirty(tx, { orderIds: [entry.orderId] });

  await notify(
    tx,
    operationStatusChanged({
      tenantId: session.tenant.id,
      actorUserId: session.user.id,
      actorName: actorName(session),
      entryId: entry.id,
      orderId: entry.orderId,
      orderNumber: entry.order.orderNumber,
      operationName: entry.workCenter.name,
      machineCode: entry.machine.code,
      status: to,
    }),
  );

  const rollup = await rollupOrderStatus(tx, session, entry.orderId, ctx, now);
  if (rollup) {
    await notify(
      tx,
      orderStatusChanged({
        tenantId: session.tenant.id,
        actorUserId: session.user.id,
        actorName: actorName(session),
        orderId: entry.orderId,
        orderNumber: entry.order.orderNumber,
        from: rollup.from,
        to: rollup.to,
      }),
    );
  }
  const risk = await reassessOrderRisk(tx, entry.orderId, now);
  if (risk.changed) {
    const riskInput = deliveryRiskChanged({
      tenantId: session.tenant.id,
      actorUserId: session.user.id,
      orderId: entry.orderId,
      orderNumber: entry.order.orderNumber,
      risk: risk.to,
    });
    if (riskInput) await notify(tx, riskInput);
  }

  return {
    entryId: entry.id,
    orderId: entry.orderId,
    orderNumber: entry.order.orderNumber,
    sequence: entry.sequence,
    machineCode: entry.machine.code,
    from,
    to,
    summary,
    orderStatus: rollup,
    risk,
    scheduleDirty: dirty,
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Roll-up
// ---------------------------------------------------------------------------------------------------------------

/** Pure roll-up rule: any IN_PROGRESS → IN_PROGRESS; all COMPLETED/SKIPPED (≥ 1 step) → COMPLETED; otherwise null. */
export function rollupTarget(steps: readonly { status: OperationStatus }[]): OrderStatus | null {
  if (steps.length === 0) return null;
  if (steps.some((s) => s.status === "IN_PROGRESS")) return "IN_PROGRESS";
  if (steps.every((s) => s.status === "COMPLETED" || s.status === "SKIPPED")) return "COMPLETED";
  return null;
}

/**
 * Rolls the operation statuses up to `Order.status` using `canTransition` with the ADMIN role (system roll-up) and
 * the M1 audit summary style. ON_HOLD orders are never rolled up (the order-level dialog owns that state).
 * Returns the transition performed, or null.
 */
export async function rollupOrderStatus(
  tx: TenantTx,
  session: Session,
  orderId: string,
  ctx?: AuditCtx,
  now: Date = new Date(),
): Promise<{ from: OrderStatus; to: OrderStatus } | null> {
  const order = await tx.order.findUnique({
    where: { id: orderId },
    select: { id: true, orderNumber: true, status: true, completedAt: true, scheduleEntries: { select: { status: true } } },
  });
  if (!order) throw new NotFoundError("Order not found.");
  if (order.status === "ON_HOLD" || order.status === "CANCELLED") return null;
  const target = rollupTarget(order.scheduleEntries);
  if (!target || target === order.status) return null;
  if (!canTransition(order.status, target, "ADMIN")) return null;

  const completedAt = completedAtFor(order.status, target, now);
  const after = await tx.order.update({
    where: { id: orderId },
    data: {
      status: target,
      ...(completedAt === undefined ? {} : { completedAt }),
      ...(target === "COMPLETED" ? { deliveryRisk: "ON_TRACK", riskReason: null, scheduleDirty: false } : {}),
    },
  });
  if (target === "COMPLETED") await resolveOrderConflicts(tx, orderId, now);
  await audit(tx, ctx ?? { actor: session.user }, {
    entityType: "Order",
    entityId: orderId,
    entityLabel: after.orderNumber,
    action: "STATUS_CHANGE",
    before: { status: order.status, completedAt: order.completedAt?.toISOString() ?? null, reason: null },
    after: { status: target, completedAt: after.completedAt?.toISOString() ?? null, reason: null },
    summary: transitionSummary(after.orderNumber, order.status, target),
  });
  return { from: order.status, to: target };
}

// ---------------------------------------------------------------------------------------------------------------
// Risk re-assessment
// ---------------------------------------------------------------------------------------------------------------

export type RiskReassessment = {
  orderId: string;
  orderNumber: string;
  from: OrderStatus extends never ? never : import("@/generated/prisma/enums").DeliveryRisk;
  to: import("@/generated/prisma/enums").DeliveryRisk;
  reason: string | null;
  changed: boolean;
};

/**
 * Cheap risk refresh after a floor update: planned/actual end of the remaining steps (an IN_PROGRESS overrun counts
 * up to `now`) vs the due date, plus any open MATERIAL_SHORTAGE conflict. Terminal orders are ON_TRACK.
 */
export async function reassessOrderRisk(tx: TenantTx, orderId: string, now: Date = new Date()): Promise<RiskReassessment> {
  const [order, tenant] = await Promise.all([
    tx.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        orderNumber: true,
        status: true,
        dueDate: true,
        deliveryRisk: true,
        riskReason: true,
        scheduleEntries: {
          select: { status: true, plannedEndAt: true, actualEndAt: true, sequence: true, machine: { select: { code: true } } },
        },
        scheduleConflicts: { where: { resolvedAt: null, type: "MATERIAL_SHORTAGE" }, select: { details: true }, take: 1 },
      },
    }),
    tx.tenant.findFirstOrThrow({
      select: { timezone: true, scheduleHorizonDays: true, defaultCalendar: { include: { shifts: true, exceptions: true } } },
    }),
  ]);
  if (!order) throw new NotFoundError("Order not found.");

  const tz = tenant.timezone;
  let risk: RiskReassessment["to"] = "ON_TRACK";
  let reason: string | null = null;

  if (order.status !== "COMPLETED" && order.status !== "CANCELLED") {
    const steps = order.scheduleEntries.filter((s) => s.status !== "SKIPPED");
    let plannedEndAt: Date | null = null;
    let lastMachineCode: string | null = null;
    let lastSeq = -1;
    for (const s of steps) {
      let end = s.actualEndAt ?? s.plannedEndAt;
      if (s.status === "IN_PROGRESS" && end.getTime() < now.getTime()) end = now;
      if (!plannedEndAt || end.getTime() > plannedEndAt.getTime()) plannedEndAt = end;
      if (s.sequence > lastSeq) {
        lastSeq = s.sequence;
        lastMachineCode = s.machine.code;
      }
    }
    const shortageDetails = order.scheduleConflicts[0]?.details as { code?: string; shortBy?: number; unit?: string } | null | undefined;
    const calendar: Calendar | null = tenant.defaultCalendar
      ? {
          shifts: tenant.defaultCalendar.shifts,
          exceptions: tenant.defaultCalendar.exceptions.map((e) => ({ date: toDateOnly(e.date), isWorking: e.isWorking })),
        }
      : null;
    const result = classifyRisk({
      plannedEndAt,
      dueDate: toDateOnly(order.dueDate),
      now,
      tz,
      hasShortage: order.scheduleConflicts.length > 0,
      shortage:
        shortageDetails && typeof shortageDetails.code === "string" && typeof shortageDetails.shortBy === "number"
          ? { code: shortageDetails.code, shortBy: shortageDetails.shortBy, unit: shortageDetails.unit ?? "" }
          : null,
      scheduled: steps.length > 0,
      horizonEnd: startOfDayInTz(addDays(todayInTz(tz, now), tenant.scheduleHorizonDays), tz),
      lastMachineCode,
      isWorkingDay: calendar && calendar.shifts.length > 0 ? (iso) => isWorkingDay(calendar, iso) : undefined,
    });
    risk = result.risk;
    reason = result.reason;
  }

  const changed = risk !== order.deliveryRisk || reason !== order.riskReason;
  if (changed) {
    await tx.order.update({ where: { id: orderId }, data: { deliveryRisk: risk, riskReason: reason } });
  }
  return { orderId, orderNumber: order.orderNumber, from: order.deliveryRisk, to: risk, reason, changed };
}

// ---------------------------------------------------------------------------------------------------------------
// Order-level hold / release (called by the order status flow)
// ---------------------------------------------------------------------------------------------------------------

export type HoldResult = { orderId: string; held: number; entryIds: string[] };

/**
 * Pauses every QUEUED / IN_PROGRESS step of an order (status → ON_HOLD) remembering the previous status in
 * `holdReason` (JSON, see `encodeHeldFrom`). Call inside the transaction that sets `Order.status = ON_HOLD`.
 */
export async function holdOrder(tx: TenantTx, session: Session, ctx: AuditCtx, orderId: string, reason: string | null = null): Promise<HoldResult> {
  const order = await tx.order.findUnique({ where: { id: orderId }, select: { id: true, orderNumber: true } });
  if (!order) throw new NotFoundError("Order not found.");
  const steps = await tx.scheduleEntry.findMany({
    where: { orderId, status: { in: ["QUEUED", "IN_PROGRESS"] } },
    select: { id: true, sequence: true, status: true, machine: { select: { code: true } } },
    orderBy: { sequence: "asc" },
  });
  const entryIds: string[] = [];
  for (const step of steps) {
    await tx.scheduleEntry.update({ where: { id: step.id }, data: { status: "ON_HOLD", holdReason: encodeHeldFrom(step.status, reason) } });
    await audit(tx, ctx, {
      entityType: "ScheduleEntry",
      entityId: step.id,
      entityLabel: `${order.orderNumber} op ${step.sequence}`,
      action: "STATUS_CHANGE",
      before: { status: step.status, reason: null },
      after: { status: "ON_HOLD", reason: reason ?? null },
      summary: operationSummary({
        machineCode: step.machine.code,
        orderNumber: order.orderNumber,
        sequence: step.sequence,
        verb: "paused",
        actorName: actorName(session),
        reason: reason ? `order on hold: ${reason}` : "order on hold",
      }),
    });
    entryIds.push(step.id);
  }
  return { orderId, held: entryIds.length, entryIds };
}

/**
 * Restores the steps paused by `holdOrder()` to their previous status. Steps paused individually on the floor (no
 * `orderHold` marker in `holdReason`) are left ON_HOLD. Call when the order leaves ON_HOLD.
 */
export async function releaseOrder(tx: TenantTx, session: Session, ctx: AuditCtx, orderId: string): Promise<HoldResult> {
  const order = await tx.order.findUnique({ where: { id: orderId }, select: { id: true, orderNumber: true } });
  if (!order) throw new NotFoundError("Order not found.");
  const steps = await tx.scheduleEntry.findMany({
    where: { orderId, status: "ON_HOLD" },
    select: { id: true, sequence: true, holdReason: true, machine: { select: { code: true } } },
    orderBy: { sequence: "asc" },
  });
  const entryIds: string[] = [];
  for (const step of steps) {
    const held = decodeHeldFrom(step.holdReason);
    if (!held) continue;
    await tx.scheduleEntry.update({ where: { id: step.id }, data: { status: held.heldFrom, holdReason: null } });
    await audit(tx, ctx, {
      entityType: "ScheduleEntry",
      entityId: step.id,
      entityLabel: `${order.orderNumber} op ${step.sequence}`,
      action: "STATUS_CHANGE",
      before: { status: "ON_HOLD", reason: null },
      after: { status: held.heldFrom, reason: null },
      summary: operationSummary({
        machineCode: step.machine.code,
        orderNumber: order.orderNumber,
        sequence: step.sequence,
        verb: held.heldFrom === "IN_PROGRESS" ? "resumed" : "released",
        actorName: actorName(session),
        reason: "order released",
      }),
    });
    entryIds.push(step.id);
  }
  return { orderId, held: entryIds.length, entryIds };
}
