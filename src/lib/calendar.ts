/**
 * Shift-calendar maths (docs/M1_SPEC.md §4 "Calendars", "Machines & capacity", §6.3).
 *
 * All calendar maths happen in the tenant timezone. A shift belongs to the date on which it STARTS; `daysOfWeek`
 * (0 = Sun … 6 = Sat) are start-date weekdays; `endTime ≤ startTime` means the shift ends the next day (22:00–06:00
 * on [1] runs Mon 22:00 → Tue 06:00 and is counted on Monday). Net minutes = duration − breakMinutes and must be > 0.
 * Shifts within a calendar must not overlap. A `CalendarException` with `isWorking=false` removes all shifts that day;
 * `isWorking=true` runs ALL of the calendar's shifts that day (even on a non-working weekday).
 *
 * Capacity is time-based: `net shift minutes × efficiencyPercent / 100 − downtime overlap`, never below 0.
 */
import { addDays, HHMM_RE, parseHHMM, toDateOnly, weekdayOf, zonedToUtc } from "./dates";
import { formatInt } from "./format";

export { parseHHMM };

export const MINUTES_PER_DAY = 1440;
export const MINUTES_PER_WEEK = 7 * MINUTES_PER_DAY;

/** Short weekday labels indexed by JS weekday (0 = Sunday). */
export const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
export const DAY_LABELS_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;
/** Weekdays in display order (Monday first), as stored values. */
export const DAYS_MON_FIRST = [1, 2, 3, 4, 5, 6, 0] as const;

/** Plain shift shape (minutes-based, matches the Prisma `Shift` scalar fields). */
export type ShiftTimes = { startTime: string; endTime: string; breakMinutes: number };
export type Shift = ShiftTimes & { id: string; name: string; daysOfWeek: number[] };
export type CalendarException = { date: string | Date; isWorking: boolean; note?: string | null };
export type Calendar = { id?: string; name?: string; shifts: Shift[]; exceptions?: CalendarException[] };
export type Downtime = {
  id?: string;
  startsAt: Date | string | number;
  endsAt: Date | string | number;
  type?: string;
  reason?: string | null;
};

export type ShiftInstance = {
  shiftId: string;
  name: string;
  /** The start date (`YYYY-MM-DD`) the instance is counted on. */
  date: string;
  startsAt: Date;
  endsAt: Date;
  /** Elapsed minutes between startsAt and endsAt (differs from the nominal duration only across a DST change). */
  grossMinutes: number;
  breakMinutes: number;
  /** grossMinutes − breakMinutes, never below 0. */
  netMinutes: number;
};

export type ShiftAvailability = ShiftInstance & {
  /** netMinutes × efficiency / 100, rounded. */
  effectiveMinutes: number;
  /** Minutes of downtime overlapping the shift (overlapping windows are unioned, never double counted). */
  downtimeMinutes: number;
  /** max(0, effectiveMinutes − downtimeMinutes). */
  availableMinutes: number;
};

export type DayAvailability = {
  date: string;
  /** Weekday of `date` (0 = Sunday). */
  weekday: number;
  /** False when nothing runs that day (non-working weekday or a non-working exception). */
  isWorking: boolean;
  exception: CalendarException | null;
  efficiencyPercent: number;
  shifts: ShiftAvailability[];
  totalNet: number;
  totalEffective: number;
  totalDowntime: number;
  totalAvailable: number;
};

const toMs = (v: Date | string | number): number => (v instanceof Date ? v.getTime() : new Date(v).getTime());

/** Sorted, de-duplicated weekdays in Monday-first display order (invalid values dropped). */
export function sortDaysMonFirst(days: Iterable<number>): number[] {
  const set = new Set<number>();
  for (const d of days) if (Number.isInteger(d) && d >= 0 && d <= 6) set.add(d);
  return DAYS_MON_FIRST.filter((d) => set.has(d));
}

/** `[1,2,3,4,5,6]` → `Mon–Sat`; `[1,3,5]` → `Mon, Wed, Fri`; `[1,2,3,4,5,0]` → `Mon–Fri, Sun`; all → `Every day`. */
export function formatDayList(days: Iterable<number>): string {
  const ordered = sortDaysMonFirst(days);
  if (ordered.length === 0) return "";
  if (ordered.length === 7) return "Every day";
  const positions = ordered.map((d) => DAYS_MON_FIRST.indexOf(d as (typeof DAYS_MON_FIRST)[number]));
  const parts: string[] = [];
  let runStart = 0;
  for (let i = 1; i <= positions.length; i++) {
    const contiguous = i < positions.length && positions[i] === positions[i - 1] + 1;
    if (!contiguous) {
      const from = DAY_LABELS[DAYS_MON_FIRST[positions[runStart]]];
      const to = DAY_LABELS[DAYS_MON_FIRST[positions[i - 1]]];
      const len = i - runStart;
      if (len === 1) parts.push(from);
      else if (len === 2) parts.push(`${from}, ${to}`);
      else parts.push(`${from}–${to}`);
      runStart = i;
    }
  }
  return parts.join(", ");
}

export function isHHMM(v: unknown): v is string {
  return typeof v === "string" && HHMM_RE.test(v);
}

/** True when the shift ends on the next calendar day (`endTime ≤ startTime`). */
export function crossesMidnight(shift: Pick<ShiftTimes, "startTime" | "endTime">): boolean {
  return parseHHMM(shift.endTime) <= parseHHMM(shift.startTime);
}

/** Nominal duration in minutes (end − start, +24 h when it crosses midnight; `08:00–08:00` = 1440). */
export function shiftGrossMinutes(shift: Pick<ShiftTimes, "startTime" | "endTime">): number {
  const start = parseHHMM(shift.startTime);
  const end = parseHHMM(shift.endTime);
  return end <= start ? end + MINUTES_PER_DAY - start : end - start;
}

/** Nominal net minutes = duration − breakMinutes (may be ≤ 0 for an invalid shift; `validateShifts` rejects that). */
export function shiftNetMinutes(shift: ShiftTimes): number {
  return shiftGrossMinutes(shift) - (Number.isFinite(shift.breakMinutes) ? shift.breakMinutes : 0);
}

type WeekInterval = { start: number; end: number; day: number };

/** Half-open [start, end) minute-of-week intervals for every day the shift runs; wraps past Sunday midnight split. */
function weekIntervals(shift: Shift): WeekInterval[] {
  const startMin = parseHHMM(shift.startTime);
  const gross = shiftGrossMinutes(shift);
  const out: WeekInterval[] = [];
  for (const day of sortDaysMonFirst(shift.daysOfWeek)) {
    const start = day * MINUTES_PER_DAY + startMin;
    const end = start + gross;
    if (end <= MINUTES_PER_WEEK) {
      out.push({ start, end, day });
    } else {
      out.push({ start, end: MINUTES_PER_WEEK, day });
      out.push({ start: 0, end: end - MINUTES_PER_WEEK, day });
    }
  }
  return out;
}

function intervalsOverlap(a: WeekInterval, b: WeekInterval): boolean {
  return a.start < b.end && b.start < a.end;
}

/**
 * Validates a calendar's shifts as a set. Returns user-facing messages (empty = valid):
 * HH:MM format, ≥ 1 valid day, break ≥ 0, net minutes > 0, and no overlap between shifts (midnight crossing and
 * the Saturday→Sunday wrap included).
 */
export function validateShifts(shifts: readonly Shift[]): string[] {
  const errors: string[] = [];
  const valid: boolean[] = [];
  shifts.forEach((shift, i) => {
    const label = shift.name?.trim() ? `"${shift.name.trim()}"` : `Shift ${i + 1}`;
    let ok = true;
    if (!isHHMM(shift.startTime)) {
      errors.push(`${label}: start time must be in HH:MM format`);
      ok = false;
    }
    if (!isHHMM(shift.endTime)) {
      errors.push(`${label}: end time must be in HH:MM format`);
      ok = false;
    }
    const days = Array.isArray(shift.daysOfWeek) ? shift.daysOfWeek : [];
    if (days.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) {
      errors.push(`${label}: days must be weekdays 0 (Sunday) to 6 (Saturday)`);
      ok = false;
    }
    if (sortDaysMonFirst(days).length === 0) {
      errors.push(`${label}: select at least one day`);
      ok = false;
    }
    if (!Number.isInteger(shift.breakMinutes) || shift.breakMinutes < 0) {
      errors.push(`${label}: break minutes must be a whole number of 0 or more`);
      ok = false;
    }
    if (ok && shiftNetMinutes(shift) <= 0) {
      errors.push(`${label}: net working time must be greater than 0 minutes (duration minus break)`);
      ok = false;
    }
    valid.push(ok);
  });

  for (let i = 0; i < shifts.length; i++) {
    if (!valid[i]) continue;
    const a = weekIntervals(shifts[i]);
    for (let j = i + 1; j < shifts.length; j++) {
      if (!valid[j]) continue;
      const b = weekIntervals(shifts[j]);
      const hit = a.find((ia) => b.some((ib) => intervalsOverlap(ia, ib)));
      if (hit) {
        const nameA = shifts[i].name?.trim() || `Shift ${i + 1}`;
        const nameB = shifts[j].name?.trim() || `Shift ${j + 1}`;
        errors.push(`"${nameA}" overlaps with "${nameB}" on ${DAY_LABELS_LONG[hit.day]}`);
      }
    }
  }
  return errors;
}

/** Sum of nominal net minutes of ALL shifts — capacity of a standard working day. */
export function dailyCapacityMinutes(calendar: Pick<Calendar, "shifts"> | readonly Shift[]): number {
  const shifts = Array.isArray(calendar) ? (calendar as readonly Shift[]) : (calendar as Calendar).shifts;
  return shifts.reduce((sum, s) => sum + Math.max(0, shiftNetMinutes(s)), 0);
}

/** Sum over shifts of net minutes × number of weekdays the shift runs. */
export function weeklyCapacityMinutes(calendar: Pick<Calendar, "shifts">): number {
  return calendar.shifts.reduce(
    (sum, s) => sum + Math.max(0, shiftNetMinutes(s)) * sortDaysMonFirst(s.daysOfWeek).length,
    0,
  );
}

/** Union of all shifts' weekdays, Monday first. */
export function workingDaysOf(calendar: Pick<Calendar, "shifts">): number[] {
  return sortDaysMonFirst(calendar.shifts.flatMap((s) => s.daysOfWeek));
}

function exceptionDate(e: CalendarException): string {
  return e.date instanceof Date ? toDateOnly(e.date) : e.date;
}

/** The exception recorded for `isoDate`, if any. */
export function findException(calendar: Pick<Calendar, "exceptions">, isoDate: string): CalendarException | null {
  return calendar.exceptions?.find((e) => exceptionDate(e) === isoDate) ?? null;
}

/** Whether any shift runs on `isoDate` (weekday match or a working exception, minus non-working exceptions). */
export function isWorkingDay(calendar: Calendar, isoDate: string): boolean {
  const ex = findException(calendar, isoDate);
  if (ex) return ex.isWorking && calendar.shifts.length > 0;
  const wd = weekdayOf(isoDate);
  return calendar.shifts.some((s) => s.daysOfWeek.includes(wd));
}

/**
 * Shift instances that START on `isoDate` (tenant tz), as absolute UTC instants, sorted by start.
 * Exceptions: `isWorking=false` → none; `isWorking=true` → all shifts regardless of weekday.
 */
export function shiftsOn(calendar: Calendar, isoDate: string, tz: string): ShiftInstance[] {
  const ex = findException(calendar, isoDate);
  let shifts: Shift[];
  if (ex && !ex.isWorking) return [];
  if (ex && ex.isWorking) {
    shifts = calendar.shifts;
  } else {
    const wd = weekdayOf(isoDate);
    shifts = calendar.shifts.filter((s) => s.daysOfWeek.includes(wd));
  }
  return shifts
    .map((s): ShiftInstance => {
      const startsAt = zonedToUtc(isoDate, s.startTime, tz);
      const endDate = crossesMidnight(s) ? addDays(isoDate, 1) : isoDate;
      const endsAt = zonedToUtc(endDate, s.endTime, tz);
      const grossMinutes = Math.round((endsAt.getTime() - startsAt.getTime()) / 60_000);
      const breakMinutes = Number.isFinite(s.breakMinutes) ? Math.max(0, s.breakMinutes) : 0;
      return {
        shiftId: s.id,
        name: s.name,
        date: isoDate,
        startsAt,
        endsAt,
        grossMinutes,
        breakMinutes,
        netMinutes: Math.max(0, grossMinutes - breakMinutes),
      };
    })
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
}

/** Minutes shared by two half-open intervals [aStart, aEnd) and [bStart, bEnd); 0 when they do not overlap. */
export function overlapMinutes(
  aStart: Date | string | number,
  aEnd: Date | string | number,
  bStart: Date | string | number,
  bEnd: Date | string | number,
): number {
  const start = Math.max(toMs(aStart), toMs(bStart));
  const end = Math.min(toMs(aEnd), toMs(bEnd));
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 0;
  return Math.round((end - start) / 60_000);
}

/** Total downtime minutes inside [start, end), with overlapping windows unioned so nothing is double counted. */
export function downtimeMinutesWithin(
  start: Date | string | number,
  end: Date | string | number,
  downtimes: readonly Downtime[],
): number {
  const lo = toMs(start);
  const hi = toMs(end);
  const clipped = downtimes
    .map((d) => ({ s: Math.max(lo, toMs(d.startsAt)), e: Math.min(hi, toMs(d.endsAt)) }))
    .filter((w) => Number.isFinite(w.s) && Number.isFinite(w.e) && w.e > w.s)
    .sort((a, b) => a.s - b.s);
  let total = 0;
  let curS = NaN;
  let curE = NaN;
  for (const w of clipped) {
    if (Number.isNaN(curS)) {
      curS = w.s;
      curE = w.e;
    } else if (w.s <= curE) {
      curE = Math.max(curE, w.e);
    } else {
      total += curE - curS;
      curS = w.s;
      curE = w.e;
    }
  }
  if (!Number.isNaN(curS)) total += curE - curS;
  return Math.round(total / 60_000);
}

/** `startsAt ≤ now < endsAt`. */
export function isDowntimeActive(downtime: Pick<Downtime, "startsAt" | "endsAt">, now: Date | number = Date.now()): boolean {
  const n = toMs(now);
  return toMs(downtime.startsAt) <= n && n < toMs(downtime.endsAt);
}

function clampEfficiency(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n) || n <= 0) return 100;
  return Math.min(150, n);
}

/**
 * Per-shift and daily available minutes for a machine on `isoDate`:
 * `available = max(0, round(net × efficiency / 100) − downtime overlap)`.
 */
export function availableMinutes(
  machine: { efficiencyPercent: number },
  calendar: Calendar,
  downtimes: readonly Downtime[],
  isoDate: string,
  tz: string,
): DayAvailability {
  const efficiencyPercent = clampEfficiency(machine.efficiencyPercent);
  const instances = shiftsOn(calendar, isoDate, tz);
  const shifts: ShiftAvailability[] = instances.map((inst) => {
    const effectiveMinutes = Math.round((inst.netMinutes * efficiencyPercent) / 100);
    const downtimeMinutes = Math.min(inst.grossMinutes, downtimeMinutesWithin(inst.startsAt, inst.endsAt, downtimes));
    return {
      ...inst,
      effectiveMinutes,
      downtimeMinutes,
      availableMinutes: Math.max(0, effectiveMinutes - downtimeMinutes),
    };
  });
  const sum = (pick: (s: ShiftAvailability) => number) => shifts.reduce((acc, s) => acc + pick(s), 0);
  return {
    date: isoDate,
    weekday: weekdayOf(isoDate),
    isWorking: shifts.length > 0,
    exception: findException(calendar, isoDate),
    efficiencyPercent,
    shifts,
    totalNet: sum((s) => s.netMinutes),
    totalEffective: sum((s) => s.effectiveMinutes),
    totalDowntime: sum((s) => s.downtimeMinutes),
    totalAvailable: sum((s) => s.availableMinutes),
  };
}

/** Availability for `days` consecutive dates starting at `fromIso` (the machine detail "Capacity — next 7 days"). */
export function availabilityRange(
  machine: { efficiencyPercent: number },
  calendar: Calendar,
  downtimes: readonly Downtime[],
  fromIso: string,
  days: number,
  tz: string,
): DayAvailability[] {
  const out: DayAvailability[] = [];
  for (let i = 0; i < days; i++) {
    out.push(availableMinutes(machine, calendar, downtimes, addDays(fromIso, i), tz));
  }
  return out;
}

/** `Mon–Sat · 2 shifts · 900 min/day · 5,400 min/week` (`No shifts` for an empty calendar). */
export function weeklySummary(calendar: Pick<Calendar, "shifts">): string {
  const n = calendar.shifts.length;
  if (n === 0) return "No shifts";
  const days = formatDayList(workingDaysOf(calendar)) || "No days";
  const perDay = dailyCapacityMinutes(calendar);
  const perWeek = weeklyCapacityMinutes(calendar);
  return `${days} · ${n} ${n === 1 ? "shift" : "shifts"} · ${formatInt(perDay)} min/day · ${formatInt(perWeek)} min/week`;
}
