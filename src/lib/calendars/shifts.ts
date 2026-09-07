/**
 * Shifts of a calendar (docs/M1_SPEC.md §4 "Calendars", §6.3). Every write re-validates the calendar's FULL shift
 * set with `validateShifts()` (HH:MM, ≥ 1 day, net minutes > 0, no overlap incl. midnight crossing) inside the
 * transaction, and a calendar always keeps at least one shift.
 */
import type { Shift } from "@/generated/prisma/client";
import { audit, auditContext } from "@/lib/audit";
import type { Session } from "@/lib/auth/guards";
import { validateShifts } from "@/lib/calendar";
import type { TenantDb, TenantTx } from "@/lib/db";
import { NotFoundError } from "@/lib/errors";
import { LastShiftError, ShiftValidationError } from "@/lib/machines/errors";
import type { ShiftInput } from "@/lib/validation/calendars";
import { getCalendar, shiftSnapshot } from "./calendars";

export type ShiftWriteInput = Omit<ShiftInput, "calendarId">;

function assertShiftSet(shifts: readonly Shift[]): void {
  const errors = validateShifts(shifts);
  if (errors.length > 0) throw new ShiftValidationError(errors);
}

async function loadShift(tx: TenantTx, id: string): Promise<Shift> {
  const s = await tx.shift.findUnique({ where: { id } });
  if (!s) throw new NotFoundError("Shift not found.");
  return s;
}

export async function addShift(db: TenantDb, session: Session, calendarId: string, input: ShiftWriteInput): Promise<Shift> {
  const ctx = await auditContext(session);
  return db.$transaction(async (tx) => {
    const calendar = await getCalendar(tx, calendarId);
    const existing = await tx.shift.findMany({ where: { calendarId } });
    const candidate: Shift = {
      id: "new",
      tenantId: session.tenant.id,
      calendarId,
      name: input.name,
      startTime: input.startTime,
      endTime: input.endTime,
      daysOfWeek: input.daysOfWeek,
      breakMinutes: input.breakMinutes,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    assertShiftSet([...existing, candidate]);
    const s = await tx.shift.create({
      data: {
        tenantId: session.tenant.id,
        calendarId,
        name: input.name,
        startTime: input.startTime,
        endTime: input.endTime,
        daysOfWeek: input.daysOfWeek,
        breakMinutes: input.breakMinutes,
      },
    });
    await audit(tx, ctx, {
      entityType: "Shift",
      entityId: s.id,
      entityLabel: `${calendar.name} · ${s.name}`,
      action: "CREATE",
      after: shiftSnapshot(s),
      summary: `Added shift ${s.name} (${s.startTime}–${s.endTime}) to calendar ${calendar.name}`,
    });
    return s;
  });
}

export async function updateShift(db: TenantDb, session: Session, id: string, input: ShiftWriteInput): Promise<Shift> {
  const ctx = await auditContext(session);
  return db.$transaction(async (tx) => {
    const before = await loadShift(tx, id);
    const calendar = await getCalendar(tx, before.calendarId);
    const siblings = await tx.shift.findMany({ where: { calendarId: before.calendarId, id: { not: id } } });
    const candidate: Shift = {
      ...before,
      name: input.name,
      startTime: input.startTime,
      endTime: input.endTime,
      daysOfWeek: input.daysOfWeek,
      breakMinutes: input.breakMinutes,
    };
    assertShiftSet([...siblings, candidate]);
    const s = await tx.shift.update({
      where: { id },
      data: {
        name: input.name,
        startTime: input.startTime,
        endTime: input.endTime,
        daysOfWeek: input.daysOfWeek,
        breakMinutes: input.breakMinutes,
      },
    });
    await audit(tx, ctx, {
      entityType: "Shift",
      entityId: s.id,
      entityLabel: `${calendar.name} · ${s.name}`,
      action: "UPDATE",
      before: shiftSnapshot(before),
      after: shiftSnapshot(s),
      summary: `Updated shift ${s.name} in calendar ${calendar.name}`,
    });
    return s;
  });
}

/** Removes a shift; throws `LastShiftError` when it is the calendar's only shift. */
export async function deleteShift(db: TenantDb, session: Session, id: string): Promise<void> {
  const ctx = await auditContext(session);
  await db.$transaction(async (tx) => {
    const s = await loadShift(tx, id);
    const calendar = await getCalendar(tx, s.calendarId);
    const remaining = await tx.shift.count({ where: { calendarId: s.calendarId, id: { not: id } } });
    if (remaining === 0) throw new LastShiftError();
    await tx.shift.delete({ where: { id } });
    await audit(tx, ctx, {
      entityType: "Shift",
      entityId: s.id,
      entityLabel: `${calendar.name} · ${s.name}`,
      action: "DELETE",
      before: shiftSnapshot(s),
      summary: `Removed shift ${s.name} from calendar ${calendar.name}`,
    });
  });
}
