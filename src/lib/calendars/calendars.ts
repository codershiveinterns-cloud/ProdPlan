/**
 * Shift calendars (docs/M1_SPEC.md §4 "Calendars", §6.3): list rows, editor loading, create (with one default
 * shift), rename, activate/deactivate, "Set as default" (through the scoped `tenant.update`) and delete — blocked
 * while the calendar is the tenant default or referenced by a machine. Audit rows are written in the same
 * transaction as each mutation.
 */
import type { Prisma, ShiftCalendar } from "@/generated/prisma/client";
import { audit, auditContext } from "@/lib/audit";
import type { Session } from "@/lib/auth/guards";
import { dailyCapacityMinutes, validateShifts, weeklySummary, type Shift as CalendarShift } from "@/lib/calendar";
import type { TenantDb, TenantTx } from "@/lib/db";
import { DomainError, NotFoundError } from "@/lib/errors";
import { InUseError, ShiftValidationError } from "@/lib/machines/errors";
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
} from "@/lib/machines/list-params";
import type { ShiftInput } from "@/lib/validation/calendars";

export const CALENDAR_SORT_KEYS = ["name", "machines"] as const;
export type CalendarSortKey = (typeof CALENDAR_SORT_KEYS)[number];

export type CalendarListParams = {
  q: string;
  page: number;
  sort: CalendarSortKey;
  dir: SortDir;
  includeInactive: boolean;
};

export function parseCalendarListParams(sp: SearchParams): CalendarListParams {
  return {
    q: parseQuery(sp),
    page: parsePage(sp),
    sort: parseSort(sp, CALENDAR_SORT_KEYS, "name"),
    dir: parseSortDir(sp, "asc"),
    includeInactive: parseFlag(sp, "includeInactive"),
  };
}

export function calendarListHref(params: CalendarListParams, patch: Partial<Omit<CalendarListParams, "sort">> & { sort?: string } = {}): string {
  // DataTable hands back the column's sortKey as a plain string; unknown keys fall back to the default.
  const sort = patch.sort !== undefined && (CALENDAR_SORT_KEYS as readonly string[]).includes(patch.sort) ? (patch.sort as CalendarSortKey) : params.sort;
  const p = { ...params, ...patch, sort };
  return listUrl("/calendars", {
    q: p.q,
    page: p.page,
    sort: p.sort === "name" ? "" : p.sort,
    dir: p.sort === "name" && p.dir === "asc" ? "" : p.dir,
    includeInactive: p.includeInactive,
  });
}

export function countCalendarFilters(params: CalendarListParams): number {
  return params.includeInactive ? 1 : 0;
}

/** The shift the "New calendar" form starts with (same as signup's "General shift"). */
export const DEFAULT_NEW_SHIFT: ShiftInput = {
  calendarId: undefined,
  name: "Day",
  startTime: "09:00",
  endTime: "17:00",
  daysOfWeek: [1, 2, 3, 4, 5, 6],
  breakMinutes: 60,
};

export type CalendarRow = {
  id: string;
  name: string;
  isActive: boolean;
  isDefault: boolean;
  shiftCount: number;
  minutesPerDay: number;
  machineCount: number;
  /** "Mon–Sat · 2 shifts · 900 min/day · 5,400 min/week" */
  summary: string;
};

function orderBy(sort: CalendarSortKey, dir: SortDir): Prisma.ShiftCalendarOrderByWithRelationInput[] {
  switch (sort) {
    case "machines":
      return [{ machines: { _count: dir } }, { name: "asc" }];
    default:
      return [{ name: dir }];
  }
}

export async function listCalendars(
  db: TenantDb,
  params: CalendarListParams,
  defaultCalendarId: string | null,
): Promise<{ rows: CalendarRow[]; total: number }> {
  const where: Prisma.ShiftCalendarWhereInput = {
    ...(params.includeInactive ? {} : { isActive: true }),
    ...(params.q ? { name: containsInsensitive(params.q) } : {}),
  };
  const [rows, total] = await Promise.all([
    db.shiftCalendar.findMany({
      where,
      orderBy: orderBy(params.sort, params.dir),
      ...pageSlice(params.page),
      include: { shifts: true, _count: { select: { machines: true } } },
    }),
    db.shiftCalendar.count({ where }),
  ]);
  return {
    rows: rows.map((c) => ({
      id: c.id,
      name: c.name,
      isActive: c.isActive,
      isDefault: c.id === defaultCalendarId,
      shiftCount: c.shifts.length,
      minutesPerDay: dailyCapacityMinutes(c.shifts),
      machineCount: c._count.machines,
      summary: weeklySummary(c),
    })),
    total,
  };
}

/** Active calendars for Selects (plus `keepId` so an edit form keeps an inactive current value). */
export async function calendarOptions(
  db: TenantDb,
  keepId?: string | null,
): Promise<Array<{ id: string; name: string; isActive: boolean }>> {
  return db.shiftCalendar.findMany({
    where: keepId ? { OR: [{ isActive: true }, { id: keepId }] } : { isActive: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true, isActive: true },
  });
}

export type CalendarEditor = Prisma.ShiftCalendarGetPayload<{
  include: { shifts: true; exceptions: true; _count: { select: { machines: true } } };
}>;

export async function getCalendarEditor(db: TenantDb, id: string): Promise<CalendarEditor | null> {
  return db.shiftCalendar.findUnique({
    where: { id },
    include: {
      shifts: { orderBy: [{ startTime: "asc" }, { name: "asc" }] },
      exceptions: { orderBy: { date: "asc" } },
      _count: { select: { machines: true } },
    },
  });
}

export async function getCalendar(db: TenantDb | TenantTx, id: string): Promise<ShiftCalendar> {
  const c = await db.shiftCalendar.findUnique({ where: { id } });
  if (!c) throw new NotFoundError("Shift calendar not found.");
  return c;
}

function snapshot(c: ShiftCalendar) {
  return { name: c.name, isActive: c.isActive };
}

export function shiftSnapshot(s: CalendarShift & { calendarId?: string }) {
  return {
    ...(s.calendarId ? { calendarId: s.calendarId } : {}),
    name: s.name,
    startTime: s.startTime,
    endTime: s.endTime,
    daysOfWeek: s.daysOfWeek,
    breakMinutes: s.breakMinutes,
  };
}

/** Creates the calendar together with its first shift (a calendar always keeps ≥ 1 shift). */
export async function createCalendar(
  db: TenantDb,
  session: Session,
  input: { name: string; shift: ShiftInput },
): Promise<ShiftCalendar> {
  const ctx = await auditContext(session);
  const errors = validateShifts([{ id: "new", ...input.shift }]);
  if (errors.length > 0) throw new ShiftValidationError(errors);
  return db.$transaction(async (tx) => {
    const c = await tx.shiftCalendar.create({ data: { tenantId: session.tenant.id, name: input.name } });
    const shift = await tx.shift.create({
      data: {
        tenantId: session.tenant.id,
        calendarId: c.id,
        name: input.shift.name,
        startTime: input.shift.startTime,
        endTime: input.shift.endTime,
        daysOfWeek: input.shift.daysOfWeek,
        breakMinutes: input.shift.breakMinutes,
      },
    });
    await audit(tx, ctx, {
      entityType: "ShiftCalendar",
      entityId: c.id,
      entityLabel: c.name,
      action: "CREATE",
      after: { ...snapshot(c), shifts: [shiftSnapshot(shift)] },
      summary: `Created shift calendar ${c.name}`,
    });
    return c;
  });
}

export async function renameCalendar(db: TenantDb, session: Session, id: string, name: string): Promise<ShiftCalendar> {
  const ctx = await auditContext(session);
  return db.$transaction(async (tx) => {
    const before = await getCalendar(tx, id);
    const c = await tx.shiftCalendar.update({ where: { id }, data: { name } });
    await audit(tx, ctx, {
      entityType: "ShiftCalendar",
      entityId: c.id,
      entityLabel: c.name,
      action: "UPDATE",
      before: snapshot(before),
      after: snapshot(c),
      summary: `Renamed shift calendar ${before.name} → ${c.name}`,
    });
    return c;
  });
}

export async function setCalendarActive(
  db: TenantDb,
  session: Session,
  id: string,
  isActive: boolean,
): Promise<ShiftCalendar> {
  const ctx = await auditContext(session);
  return db.$transaction(async (tx) => {
    const before = await getCalendar(tx, id);
    if (!isActive) {
      const tenant = await tx.tenant.findUnique({ where: { id: session.tenant.id }, select: { defaultCalendarId: true } });
      if (tenant?.defaultCalendarId === id) {
        throw new DomainError("This is the default calendar. Set another calendar as default before deactivating it.");
      }
    }
    const c = await tx.shiftCalendar.update({ where: { id }, data: { isActive } });
    await audit(tx, ctx, {
      entityType: "ShiftCalendar",
      entityId: c.id,
      entityLabel: c.name,
      action: "UPDATE",
      before: snapshot(before),
      after: snapshot(c),
      summary: `${isActive ? "Reactivated" : "Deactivated"} shift calendar ${c.name}`,
    });
    return c;
  });
}

/** Updates `Tenant.defaultCalendarId` through the scoped client (audited as a Tenant UPDATE). */
export async function setDefaultCalendar(db: TenantDb, session: Session, id: string): Promise<void> {
  const ctx = await auditContext(session);
  await db.$transaction(async (tx) => {
    const c = await getCalendar(tx, id);
    if (!c.isActive) throw new DomainError("An inactive calendar cannot be the default. Reactivate it first.");
    const tenant = await tx.tenant.findUnique({
      where: { id: session.tenant.id },
      select: { id: true, name: true, defaultCalendarId: true },
    });
    if (!tenant) throw new NotFoundError("Tenant not found.");
    if (tenant.defaultCalendarId === id) return;
    const previous = tenant.defaultCalendarId
      ? await tx.shiftCalendar.findUnique({ where: { id: tenant.defaultCalendarId }, select: { name: true } })
      : null;
    await tx.tenant.update({ where: { id: tenant.id }, data: { defaultCalendarId: id } });
    await audit(tx, ctx, {
      entityType: "Tenant",
      entityId: tenant.id,
      entityLabel: tenant.name,
      action: "UPDATE",
      before: { defaultCalendarId: tenant.defaultCalendarId, defaultCalendarName: previous?.name ?? null },
      after: { defaultCalendarId: id, defaultCalendarName: c.name },
      summary: `Set default shift calendar to ${c.name}`,
    });
  });
}

/** Whether (and why not) a calendar can be hard-deleted. */
export async function calendarDeleteBlock(
  db: TenantDb | TenantTx,
  id: string,
  defaultCalendarId: string | null,
): Promise<string | null> {
  if (defaultCalendarId === id) return "This is the default calendar. Set another calendar as default first.";
  const machines = await db.machine.count({ where: { calendarId: id } });
  if (machines > 0) return `Used by ${machines} ${machines === 1 ? "machine" : "machines"}. Deactivate it instead.`;
  return null;
}

/** Hard delete (shifts/exceptions cascade); blocked while default or referenced by a machine. */
export async function deleteCalendar(db: TenantDb, session: Session, id: string): Promise<void> {
  const ctx = await auditContext(session);
  await db.$transaction(async (tx) => {
    const c = await tx.shiftCalendar.findUnique({ where: { id }, include: { shifts: true } });
    if (!c) throw new NotFoundError("Shift calendar not found.");
    const tenant = await tx.tenant.findUnique({ where: { id: session.tenant.id }, select: { defaultCalendarId: true } });
    const blocked = await calendarDeleteBlock(tx, id, tenant?.defaultCalendarId ?? null);
    if (blocked) throw new InUseError(blocked);
    await tx.shiftCalendar.delete({ where: { id } });
    await audit(tx, ctx, {
      entityType: "ShiftCalendar",
      entityId: c.id,
      entityLabel: c.name,
      action: "DELETE",
      before: { ...snapshot(c), shifts: c.shifts.map(shiftSnapshot) },
      summary: `Deleted shift calendar ${c.name}`,
    });
  });
}

/** Audit rows for a calendar, its shifts and exceptions (deleted children included via the JSON snapshots). */
export function calendarAuditWhere(calendarId: string): Prisma.AuditLogWhereInput {
  return {
    OR: [
      { entityType: "ShiftCalendar", entityId: calendarId },
      { entityType: { in: ["Shift", "CalendarException"] }, after: { path: ["calendarId"], equals: calendarId } },
      { entityType: { in: ["Shift", "CalendarException"] }, before: { path: ["calendarId"], equals: calendarId } },
    ],
  };
}
