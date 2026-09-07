/**
 * Integration: shift calendar rules (docs/M1_SPEC.md §4 "Calendars", §6.3) — set default through the scoped
 * tenant update, delete blocked while default/used, a calendar keeps ≥ 1 shift, overlapping shifts rejected,
 * one exception per date.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Session } from "@/lib/auth/guards";
import { prisma } from "@/lib/db";
import { DomainError } from "@/lib/errors";
import {
  calendarAuditWhere,
  calendarDeleteBlock,
  createCalendar,
  DEFAULT_NEW_SHIFT,
  deleteCalendar,
  listCalendars,
  parseCalendarListParams,
  renameCalendar,
  setCalendarActive,
  setDefaultCalendar,
} from "@/lib/calendars/calendars";
import { addException, deleteException, EXCEPTION_EXISTS_MESSAGE, updateException } from "@/lib/calendars/exceptions";
import { addShift, deleteShift, updateShift } from "@/lib/calendars/shifts";
import { mapModuleError, SHIFTS_FIELD } from "@/lib/machines/action-helpers";
import { FieldRuleError, InUseError, LastShiftError, ShiftValidationError } from "@/lib/machines/errors";
import { createTenantFixture, dbAvailable, deleteTenant, disconnectDb, type TenantFixture } from "./helpers";

const available = await dbAvailable();

function sessionFor(f: TenantFixture): Session {
  const { passwordHash: _hash, tokenVersion: _tv, ...user } = f.admin;
  void _hash;
  void _tv;
  return {
    user,
    tenant: { id: f.tenant.id, name: f.tenant.name, slug: f.tenant.slug, timezone: f.tenant.timezone, defaultCalendarId: f.tenant.defaultCalendarId },
  };
}

const MON_SAT = [1, 2, 3, 4, 5, 6];

describe.skipIf(!available)("shift calendar rules (integration)", () => {
  let F: TenantFixture;
  let session: Session;
  let twoShiftsId: string;

  beforeAll(async () => {
    F = await createTenantFixture({ slugPrefix: "cal" });
    session = sessionFor(F);
  });

  afterAll(async () => {
    await deleteTenant(F?.tenant.id);
    await disconnectDb();
  });

  it("creates a calendar with one default shift and lists it with the Default badge data", async () => {
    const c = await createCalendar(F.db, session, { name: "Two shifts", shift: DEFAULT_NEW_SHIFT });
    twoShiftsId = c.id;
    const shifts = await prisma.shift.findMany({ where: { calendarId: c.id } });
    expect(shifts).toHaveLength(1);
    expect(shifts[0]).toMatchObject({ tenantId: F.tenant.id, name: "Day", startTime: "09:00", endTime: "17:00", daysOfWeek: MON_SAT, breakMinutes: 60 });

    const { rows } = await listCalendars(F.db, parseCalendarListParams({}), F.tenant.defaultCalendarId);
    expect(rows.map((r) => r.name)).toEqual(["General shift", "Two shifts"]);
    expect(rows[0]).toMatchObject({ isDefault: true, shiftCount: 1, minutesPerDay: 420, machineCount: 0, summary: "Mon–Sat · 1 shift · 420 min/day · 2,520 min/week" });
    expect(rows[1].isDefault).toBe(false);

    const renamed = await renameCalendar(F.db, session, c.id, "Two shifts (CNC)");
    expect(renamed.name).toBe("Two shifts (CNC)");
    const audit = await prisma.auditLog.findMany({ where: { tenantId: F.tenant.id, entityType: "ShiftCalendar", entityId: c.id }, orderBy: { createdAt: "asc" } });
    expect(audit.map((r) => r.action)).toEqual(["CREATE", "UPDATE"]);
    expect(audit[1].summary).toBe("Renamed shift calendar Two shifts → Two shifts (CNC)");
  });

  it("set as default updates Tenant.defaultCalendarId through the scoped client and audits a Tenant row", async () => {
    await setDefaultCalendar(F.db, session, twoShiftsId);
    const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: F.tenant.id } });
    expect(tenant.defaultCalendarId).toBe(twoShiftsId);
    const row = await prisma.auditLog.findFirstOrThrow({ where: { tenantId: F.tenant.id, entityType: "Tenant", action: "UPDATE" }, orderBy: { createdAt: "desc" } });
    expect(row.summary).toBe("Set default shift calendar to Two shifts (CNC)");
    expect(row.changedFields).toEqual(expect.arrayContaining(["defaultCalendarId"]));
    expect(row.before).toMatchObject({ defaultCalendarId: F.calendar.id });
    expect(row.after).toMatchObject({ defaultCalendarId: twoShiftsId });

    // Idempotent: setting the same default again writes nothing new.
    const countBefore = await prisma.auditLog.count({ where: { tenantId: F.tenant.id, entityType: "Tenant" } });
    await setDefaultCalendar(F.db, session, twoShiftsId);
    expect(await prisma.auditLog.count({ where: { tenantId: F.tenant.id, entityType: "Tenant" } })).toBe(countBefore);

    // The default cannot be deactivated; an inactive calendar cannot become default.
    await expect(setCalendarActive(F.db, session, twoShiftsId, false)).rejects.toBeInstanceOf(DomainError);
    await setCalendarActive(F.db, session, F.calendar.id, false);
    await expect(setDefaultCalendar(F.db, session, F.calendar.id)).rejects.toThrow(/inactive calendar/i);
    await setCalendarActive(F.db, session, F.calendar.id, true);
    await setDefaultCalendar(F.db, session, F.calendar.id);
    expect((await prisma.tenant.findUniqueOrThrow({ where: { id: F.tenant.id } })).defaultCalendarId).toBe(F.calendar.id);
  });

  it("cannot delete the default calendar or one used by a machine; an unused one deletes with cascade", async () => {
    await expect(deleteCalendar(F.db, session, F.calendar.id)).rejects.toBeInstanceOf(InUseError);
    await expect(deleteCalendar(F.db, session, F.calendar.id)).rejects.toThrow(/default calendar/);
    expect(await calendarDeleteBlock(F.db, F.calendar.id, F.calendar.id)).toMatch(/default calendar/);

    const wc = await prisma.workCenter.create({ data: { tenantId: F.tenant.id, code: "ASM", name: "Assembly" } });
    const machine = await prisma.machine.create({ data: { tenantId: F.tenant.id, workCenterId: wc.id, calendarId: twoShiftsId, code: "ASM-1", name: "Bench" } });
    await expect(deleteCalendar(F.db, session, twoShiftsId)).rejects.toThrow(/Used by 1 machine/);
    expect(await calendarDeleteBlock(F.db, twoShiftsId, F.calendar.id)).toBe("Used by 1 machine. Deactivate it instead.");
    const { rows } = await listCalendars(F.db, parseCalendarListParams({ q: "two" }), F.calendar.id);
    expect(rows[0].machineCount).toBe(1);
    await prisma.machine.delete({ where: { id: machine.id } });

    const tmp = await createCalendar(F.db, session, { name: "Temporary", shift: DEFAULT_NEW_SHIFT });
    await addException(F.db, session, tmp.id, { date: "2026-10-20", isWorking: false, note: "Diwali" });
    expect(await calendarDeleteBlock(F.db, tmp.id, F.calendar.id)).toBeNull();
    await deleteCalendar(F.db, session, tmp.id);
    expect(await prisma.shiftCalendar.count({ where: { id: tmp.id } })).toBe(0);
    expect(await prisma.shift.count({ where: { calendarId: tmp.id } })).toBe(0);
    expect(await prisma.calendarException.count({ where: { calendarId: tmp.id } })).toBe(0);
    const del = await prisma.auditLog.findFirstOrThrow({ where: { tenantId: F.tenant.id, entityType: "ShiftCalendar", entityId: tmp.id, action: "DELETE" } });
    expect(del.before).toMatchObject({ name: "Temporary" });
  });

  it("rejects overlapping shifts (including midnight crossing) and accepts a clean second shift", async () => {
    const day = await prisma.shift.findFirstOrThrow({ where: { calendarId: twoShiftsId } });
    const overlapping = { name: "Afternoon", startTime: "16:00", endTime: "23:00", daysOfWeek: MON_SAT, breakMinutes: 30 };
    const err = await addShift(F.db, session, twoShiftsId, overlapping).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ShiftValidationError);
    expect((err as ShiftValidationError).messages[0]).toMatch(/"Day" overlaps with "Afternoon" on Monday/);
    expect(mapModuleError(err)).toMatchObject({ ok: false, fieldErrors: { [SHIFTS_FIELD]: expect.arrayContaining([expect.stringMatching(/overlaps/)]) } });
    expect(await prisma.shift.count({ where: { calendarId: twoShiftsId } })).toBe(1);

    // A night shift Mon 22:00 → Tue 06:00 does not touch Day (09:00–17:00) …
    const night = await addShift(F.db, session, twoShiftsId, { name: "Night", startTime: "22:00", endTime: "06:00", daysOfWeek: [1, 2, 3, 4, 5], breakMinutes: 60 });
    expect(night.daysOfWeek).toEqual([1, 2, 3, 4, 5]);
    // … but stretching Day to 23:00 overlaps Night, and editing Night to end 09:30 overlaps Day.
    await expect(updateShift(F.db, session, day.id, { name: "Day", startTime: "09:00", endTime: "23:00", daysOfWeek: MON_SAT, breakMinutes: 60 })).rejects.toBeInstanceOf(ShiftValidationError);
    await expect(updateShift(F.db, session, night.id, { name: "Night", startTime: "22:00", endTime: "09:30", daysOfWeek: [1], breakMinutes: 0 })).rejects.toBeInstanceOf(ShiftValidationError);
    // Net minutes must stay > 0 and at least one day is required (server-side, independent of zod).
    await expect(updateShift(F.db, session, night.id, { name: "Night", startTime: "22:00", endTime: "23:00", daysOfWeek: [1], breakMinutes: 60 })).rejects.toThrow(/net working time/);
    await expect(updateShift(F.db, session, night.id, { name: "Night", startTime: "22:00", endTime: "23:00", daysOfWeek: [], breakMinutes: 0 })).rejects.toThrow(/at least one day/);

    const moved = await updateShift(F.db, session, night.id, { name: "Night", startTime: "18:00", endTime: "02:00", daysOfWeek: [1, 2, 3, 4, 5], breakMinutes: 30 });
    expect(moved).toMatchObject({ startTime: "18:00", endTime: "02:00", breakMinutes: 30 });
    const { rows } = await listCalendars(F.db, parseCalendarListParams({ q: "two" }), F.calendar.id);
    expect(rows[0]).toMatchObject({ shiftCount: 2, minutesPerDay: 420 + 450 });
  });

  it("cannot remove the last shift of a calendar", async () => {
    const shifts = await prisma.shift.findMany({ where: { calendarId: twoShiftsId }, orderBy: { name: "asc" } });
    expect(shifts).toHaveLength(2);
    await deleteShift(F.db, session, shifts[1].id);
    expect(await prisma.shift.count({ where: { calendarId: twoShiftsId } })).toBe(1);
    await expect(deleteShift(F.db, session, shifts[0].id)).rejects.toBeInstanceOf(LastShiftError);
    expect(await prisma.shift.count({ where: { calendarId: twoShiftsId } })).toBe(1);
    // The fixture's default calendar has a single shift too.
    await expect(deleteShift(F.db, session, F.shift.id)).rejects.toThrow(/at least one shift/);

    const audit = await prisma.auditLog.findMany({ where: { tenantId: F.tenant.id, entityType: "Shift" }, orderBy: { createdAt: "asc" } });
    expect(audit.map((r) => r.action)).toEqual(["CREATE", "UPDATE", "DELETE"]);
    expect(audit[2].summary).toBe("Removed shift Night from calendar Two shifts (CNC)");
  });

  it("allows one exception per date and reports a duplicate as a field error", async () => {
    const ex = await addException(F.db, session, twoShiftsId, { date: "2026-10-20", isWorking: false, note: "Diwali" });
    expect(ex.date.toISOString()).toBe("2026-10-20T00:00:00.000Z");
    const dup = await addException(F.db, session, twoShiftsId, { date: "2026-10-20", isWorking: true, note: undefined }).catch((e: unknown) => e);
    expect(dup).toBeInstanceOf(FieldRuleError);
    expect(dup).toMatchObject({ field: "date", message: EXCEPTION_EXISTS_MESSAGE });
    expect(mapModuleError(dup)).toEqual({ ok: false, error: EXCEPTION_EXISTS_MESSAGE, fieldErrors: { date: [EXCEPTION_EXISTS_MESSAGE] } });

    const sunday = await addException(F.db, session, twoShiftsId, { date: "2026-10-25", isWorking: true, note: "Overtime" });
    await expect(updateException(F.db, session, sunday.id, { date: "2026-10-20", isWorking: true, note: undefined })).rejects.toBeInstanceOf(FieldRuleError);
    const updated = await updateException(F.db, session, sunday.id, { date: "2026-10-26", isWorking: true, note: "Overtime (moved)" });
    expect(updated.note).toBe("Overtime (moved)");
    await deleteException(F.db, session, ex.id);
    expect(await prisma.calendarException.count({ where: { calendarId: twoShiftsId } })).toBe(1);

    const audit = await F.db.auditLog.findMany({ where: { AND: [calendarAuditWhere(twoShiftsId), { entityType: "CalendarException" }] }, orderBy: { createdAt: "asc" } });
    expect(audit.map((r) => r.action)).toEqual(["CREATE", "CREATE", "UPDATE", "DELETE"]);
    expect(audit[0].summary).toBe("Added exception 20 Oct 2026 (non-working: Diwali) to calendar Two shifts (CNC)");
  });

  it("is tenant-scoped: another tenant cannot set our calendar as its default", async () => {
    const other = await createTenantFixture({ slugPrefix: "cal-other" });
    try {
      await expect(setDefaultCalendar(other.db, sessionFor(other), twoShiftsId)).rejects.toMatchObject({ code: "not_found" });
      expect((await prisma.tenant.findUniqueOrThrow({ where: { id: other.tenant.id } })).defaultCalendarId).toBe(other.calendar.id);
      expect((await listCalendars(other.db, parseCalendarListParams({}), other.calendar.id)).total).toBe(1);
    } finally {
      await deleteTenant(other.tenant.id);
    }
  });
});
