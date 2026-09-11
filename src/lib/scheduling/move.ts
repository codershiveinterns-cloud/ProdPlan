/**
 * Drag-to-reschedule (docs/M2_SPEC.md §3 "Drag-to-reschedule"). `validateMove()` is the pure eligibility check
 * (unit-tested without a database); `moveEntry()` loads the entry + target machine, snaps/shifts the drop instant,
 * persists the lock and re-runs the schedule so the rest of the plan re-flows around it. `unlockEntry()` clears the
 * lock and re-runs.
 *
 *   locked = a manually placed entry the engine must never move again (until unlocked).
 */
import type { MachineStatus, OperationStatus } from "@/generated/prisma/enums";
import { audit, type AuditCtx } from "@/lib/audit";
import type { Session } from "@/lib/auth/guards";
import type { Calendar } from "@/lib/calendar";
import { addDays, todayInTz } from "@/lib/dates";
import type { TenantDb } from "@/lib/db";
import { DomainError, NotFoundError } from "@/lib/errors";
import { runSchedule, type ScheduleRunResult } from "./run";
import { MOVE_SNAP_MINUTES } from "./constants";
import { downtimeIntervals, placeWork, roundToMinutes, subtractIntervals, workingWindows, type Interval } from "./windows";

export { MOVE_SNAP_MINUTES };

/** How far ahead of the drop instant the target machine's working windows are computed (generous — a locked entry
 *  dropped near a long holiday run still finds the next working instant). */
const LOOKAHEAD_DAYS = 120;

const NON_MOVABLE_STATUSES: readonly OperationStatus[] = ["IN_PROGRESS", "COMPLETED"];

export type MoveEntryInput = { entryId: string; machineId: string; plannedStartAt: Date };

// ---------------------------------------------------------------------------------------------------------------
// validateMove — pure eligibility check
// ---------------------------------------------------------------------------------------------------------------

export type MoveValidationContext = {
  entryStatus: OperationStatus;
  /** The entry's CURRENT work center — the target machine must belong to it. */
  entryWorkCenterId: string;
  targetMachine: { id: string; workCenterId: string; status: MachineStatus } | null;
  /** The routing step's fixed machine, when the routing pins one (only that machine is eligible). */
  fixedMachineId?: string | null;
};

/** Throws when the move is not allowed; returns void otherwise. Never touches the database. */
export function validateMove(ctx: MoveValidationContext): void {
  if (NON_MOVABLE_STATUSES.includes(ctx.entryStatus)) {
    throw new DomainError("An operation that is in progress or completed cannot be moved", "entry_fixed", 409);
  }
  if (!ctx.targetMachine) {
    throw new NotFoundError("Machine not found.");
  }
  if (ctx.fixedMachineId && ctx.fixedMachineId !== ctx.targetMachine.id) {
    throw new DomainError("This operation's routing step is fixed to a specific machine", "fixed_machine", 409);
  }
  if (ctx.targetMachine.workCenterId !== ctx.entryWorkCenterId) {
    throw new DomainError("The target machine must belong to the same work center", "wrong_work_center", 409);
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Snap + shift-forward (pure; free intervals are computed by the caller from calendar + downtime)
// ---------------------------------------------------------------------------------------------------------------

/** Nearest 15-minute grid instant, then the first working instant at or after it (unchanged when `free` is empty
 *  everywhere ahead — the caller decides what to do in that unlikely case). */
export function snapMoveInstant(at: Date, free: readonly Interval[]): Date {
  const snapped = roundToMinutes(at, MOVE_SNAP_MINUTES);
  let cursor: number | null = null;
  for (const w of free) {
    if (w.e <= snapped.getTime()) continue;
    cursor = Math.max(w.s, snapped.getTime());
    break;
  }
  return new Date(cursor ?? snapped.getTime());
}

// ---------------------------------------------------------------------------------------------------------------
// moveEntry / unlockEntry
// ---------------------------------------------------------------------------------------------------------------

export type MoveResult = {
  entryId: string;
  orderId: string;
  orderNumber: string;
  sequence: number;
  machineId: string;
  machineCode: string;
  plannedStartAt: Date;
  plannedEndAt: Date;
  summary: string;
  run: ScheduleRunResult;
};

function weekdayTime(d: Date, tz: string): string {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: tz, weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(d);
  const weekday = parts.find((p) => p.type === "weekday")?.value ?? "";
  const hour = parts.find((p) => p.type === "hour")?.value ?? "00";
  const minute = parts.find((p) => p.type === "minute")?.value ?? "00";
  return `${weekday} ${hour}:${minute}`;
}

/** Loads the calendar + downtime of one machine and returns its free working windows over a lookahead window. */
async function freeWindowsFor(db: TenantDb, machineId: string, calendarId: string, tz: string, from: Date): Promise<Interval[]> {
  const [calendarRow, downtimeRows] = await Promise.all([
    db.shiftCalendar.findUnique({ where: { id: calendarId }, include: { shifts: true, exceptions: true } }),
    db.downtimeWindow.findMany({
      where: { machineId, endsAt: { gt: from } },
      select: { startsAt: true, endsAt: true, type: true, reason: true },
    }),
  ]);
  const calendar: Calendar = calendarRow
    ? {
        shifts: calendarRow.shifts.map((s) => ({ id: s.id, name: s.name, startTime: s.startTime, endTime: s.endTime, daysOfWeek: s.daysOfWeek, breakMinutes: s.breakMinutes })),
        exceptions: calendarRow.exceptions.map((e) => ({ date: e.date, isWorking: e.isWorking, note: e.note })),
      }
    : { shifts: [], exceptions: [] };
  const fromIso = todayInTz(tz, from);
  const toIso = addDays(fromIso, LOOKAHEAD_DAYS);
  const working = workingWindows(calendar, tz, fromIso, toIso, { clipStart: from.getTime() });
  return subtractIntervals(working, downtimeIntervals(downtimeRows.map((d) => ({ startsAt: d.startsAt, endsAt: d.endsAt, type: d.type, reason: d.reason }))));
}

/**
 * Validates, snaps to the 15-min grid, shifts into the next working instant on the target machine, locks the entry
 * and re-runs the schedule (`trigger: "move"`) so the rest of the plan re-flows around the lock.
 */
export async function moveEntry(db: TenantDb, session: Session, ctx: AuditCtx, input: MoveEntryInput): Promise<MoveResult> {
  const entry = await db.scheduleEntry.findUnique({
    where: { id: input.entryId },
    include: {
      order: { select: { id: true, orderNumber: true } },
      operation: { select: { machineId: true } },
    },
  });
  if (!entry) throw new NotFoundError("Operation not found.");

  const targetMachine = await db.machine.findUnique({
    where: { id: input.machineId },
    select: { id: true, code: true, workCenterId: true, status: true, calendarId: true },
  });

  validateMove({
    entryStatus: entry.status,
    entryWorkCenterId: entry.workCenterId,
    targetMachine: targetMachine ? { id: targetMachine.id, workCenterId: targetMachine.workCenterId, status: targetMachine.status } : null,
    fixedMachineId: entry.operation?.machineId ?? null,
  });
  // targetMachine is non-null past validateMove (it throws NotFoundError otherwise).
  const machine = targetMachine!;

  const tz = session.tenant.timezone;
  const free = await freeWindowsFor(db, machine.id, machine.calendarId, tz, input.plannedStartAt);
  const plannedStartAt = snapMoveInstant(input.plannedStartAt, free);
  const placement = placeWork(free, plannedStartAt.getTime(), entry.plannedMinutes);
  const plannedEndAt = placement ? new Date(placement.end) : new Date(plannedStartAt.getTime() + (entry.plannedEndAt.getTime() - entry.plannedStartAt.getTime()));
  const now = new Date();

  const summary = `${entry.order.orderNumber} op ${entry.sequence} moved to ${machine.code}, ${weekdayTime(plannedStartAt, tz)}`;

  await db.$transaction(async (tx) => {
    await tx.scheduleEntry.update({
      where: { id: entry.id },
      data: {
        machineId: machine.id,
        workCenterId: machine.workCenterId,
        plannedStartAt,
        plannedEndAt,
        locked: true,
        lockedById: session.user.id,
        lockedAt: now,
      },
    });
    await audit(tx, ctx, {
      entityType: "ScheduleEntry",
      entityId: entry.id,
      entityLabel: `${entry.order.orderNumber} op ${entry.sequence}`,
      action: "UPDATE",
      before: { machineId: entry.machineId, plannedStartAt: entry.plannedStartAt.toISOString(), locked: entry.locked },
      after: { machineId: machine.id, plannedStartAt: plannedStartAt.toISOString(), locked: true },
      summary,
    });
  });

  const run = await runSchedule(db, session, ctx, { trigger: "move" });

  return {
    entryId: entry.id,
    orderId: entry.orderId,
    orderNumber: entry.order.orderNumber,
    sequence: entry.sequence,
    machineId: machine.id,
    machineCode: machine.code,
    plannedStartAt,
    plannedEndAt,
    summary,
    run,
  };
}

/** Clears the manual lock and re-runs the schedule so the entry re-flows with everything else. */
export async function unlockEntry(db: TenantDb, session: Session, ctx: AuditCtx, entryId: string): Promise<ScheduleRunResult> {
  const entry = await db.scheduleEntry.findUnique({
    where: { id: entryId },
    select: { id: true, locked: true, machineId: true, plannedStartAt: true, sequence: true, order: { select: { orderNumber: true } } },
  });
  if (!entry) throw new NotFoundError("Operation not found.");

  if (entry.locked) {
    await db.$transaction(async (tx) => {
      await tx.scheduleEntry.update({ where: { id: entry.id }, data: { locked: false, lockedById: null, lockedAt: null } });
      await audit(tx, ctx, {
        entityType: "ScheduleEntry",
        entityId: entry.id,
        entityLabel: `${entry.order.orderNumber} op ${entry.sequence}`,
        action: "UPDATE",
        before: { locked: true },
        after: { locked: false },
        summary: `${entry.order.orderNumber} op ${entry.sequence} unlocked`,
      });
    });
  }

  return runSchedule(db, session, ctx, { trigger: "move" });
}
