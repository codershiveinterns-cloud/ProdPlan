/**
 * Date helpers (docs/M1_SPEC.md §4, §5).
 *
 * Calendar dates cross the application boundary ONLY as ISO strings `YYYY-MM-DD`; `@db.Date` columns are read/written
 * as UTC-midnight `Date`s (`fromDateOnly` / `toDateOnly`). "Today" is always computed in the tenant timezone with
 * `todayInTz()` — never with `new Date()` date arithmetic. Timestamps are UTC instants; `zonedToUtc` / `utcToZonedParts`
 * translate wall-clock values in a tenant timezone to and from instants (via `@date-fns/tz` TZDate).
 */
import { TZDate } from "@date-fns/tz";

export const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export const HHMM_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export const DAY_MS = 86_400_000;
export const MINUTES_PER_DAY = 1440;

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function pad4(n: number): string {
  return String(n).padStart(4, "0");
}

function toMs(v: Date | number | string): number {
  const ms = v instanceof Date ? v.getTime() : typeof v === "number" ? v : new Date(v).getTime();
  if (!Number.isFinite(ms)) throw new RangeError(`Invalid date value: ${String(v)}`);
  return ms;
}

/** True when `tz` is an IANA time zone the runtime's Intl accepts (e.g. "Asia/Kolkata", "UTC"). */
export function isValidTimeZone(tz: unknown): tz is string {
  if (typeof tz !== "string" || tz.trim() === "") return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

function assertTimeZone(tz: string): void {
  if (!isValidTimeZone(tz)) throw new RangeError(`Invalid time zone: ${String(tz)}`);
}

/** Parses `YYYY-MM-DD`; throws RangeError on a malformed string or an impossible date (2026-02-30). */
export function parseDateOnly(iso: string): { year: number; month: number; day: number } {
  if (typeof iso !== "string" || !ISO_DATE_RE.test(iso)) {
    throw new RangeError(`Invalid ISO date: ${String(iso)}`);
  }
  const year = Number(iso.slice(0, 4));
  const month = Number(iso.slice(5, 7));
  const day = Number(iso.slice(8, 10));
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (probe.getUTCFullYear() !== year || probe.getUTCMonth() !== month - 1 || probe.getUTCDate() !== day) {
    throw new RangeError(`Invalid ISO date: ${iso}`);
  }
  return { year, month, day };
}

/** True when `v` is a real calendar date in `YYYY-MM-DD` form. */
export function isIsoDate(v: unknown): v is string {
  try {
    parseDateOnly(v as string);
    return true;
  } catch {
    return false;
  }
}

/** `YYYY-MM-DD` → UTC-midnight Date, the representation Prisma expects for `@db.Date` columns. */
export function fromDateOnly(iso: string): Date {
  const { year, month, day } = parseDateOnly(iso);
  return new Date(Date.UTC(year, month - 1, day));
}

/**
 * Date → `YYYY-MM-DD` using the UTC calendar day. Intended for `@db.Date` values (UTC midnight) coming back from
 * Prisma; for arbitrary instants use `utcToZonedParts(d, tz).date` instead.
 */
export function toDateOnly(d: Date): string {
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) throw new RangeError("Invalid date");
  return `${pad4(d.getUTCFullYear())}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

/** Today's calendar date (`YYYY-MM-DD`) in the given IANA time zone. `now` is injectable for tests. */
export function todayInTz(tz: string, now: Date | number = Date.now()): string {
  assertTimeZone(tz);
  const z = new TZDate(toMs(now), tz);
  return `${pad4(z.getFullYear())}-${pad2(z.getMonth() + 1)}-${pad2(z.getDate())}`;
}

/** Adds `n` whole days (negative allowed) to an ISO date. */
export function addDays(iso: string, n: number): string {
  if (!Number.isFinite(n)) throw new RangeError(`Invalid day count: ${String(n)}`);
  return toDateOnly(new Date(fromDateOnly(iso).getTime() + Math.trunc(n) * DAY_MS));
}

/** Whole days from `from` to `to` (`to − from`): positive when `to` is later. */
export function diffDays(from: string, to: string): number {
  return Math.round((fromDateOnly(to).getTime() - fromDateOnly(from).getTime()) / DAY_MS);
}

/** Lexicographic compare of two ISO dates (valid `YYYY-MM-DD` strings sort chronologically). */
export function compareDateOnly(a: string, b: string): number {
  parseDateOnly(a);
  parseDateOnly(b);
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Weekday of an ISO date: 0 = Sunday … 6 = Saturday (matches `Shift.daysOfWeek`). */
export function weekdayOf(iso: string): number {
  return fromDateOnly(iso).getUTCDay();
}

/** `HH:MM` (24 h) → minutes since midnight. Throws RangeError on anything else. */
export function parseHHMM(s: string): number {
  if (typeof s !== "string" || !HHMM_RE.test(s)) throw new RangeError(`Invalid time (expected HH:MM): ${String(s)}`);
  return Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5));
}

/** Minutes since midnight → `HH:MM` (wraps past 24 h, so 1500 → "01:00"). */
export function formatHHMM(minutes: number): string {
  if (!Number.isFinite(minutes)) throw new RangeError(`Invalid minutes: ${String(minutes)}`);
  const m = ((Math.round(minutes) % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  return `${pad2(Math.floor(m / 60))}:${pad2(m % 60)}`;
}

/**
 * Wall-clock date + time in `tz` → UTC instant. Non-existent local times (DST gap) resolve forward;
 * ambiguous ones (DST overlap) take the first occurrence (TZDate behaviour).
 */
export function zonedToUtc(dateIso: string, timeHHMM: string, tz: string): Date {
  assertTimeZone(tz);
  const { year, month, day } = parseDateOnly(dateIso);
  const minutes = parseHHMM(timeHHMM);
  const z = new TZDate(year, month - 1, day, Math.floor(minutes / 60), minutes % 60, 0, tz);
  return new Date(z.getTime());
}

/** UTC instant → `{ date: 'YYYY-MM-DD', time: 'HH:MM' }` as seen on a clock in `tz`. */
export function utcToZonedParts(d: Date | number | string, tz: string): { date: string; time: string } {
  assertTimeZone(tz);
  const z = new TZDate(toMs(d), tz);
  return {
    date: `${pad4(z.getFullYear())}-${pad2(z.getMonth() + 1)}-${pad2(z.getDate())}`,
    time: `${pad2(z.getHours())}:${pad2(z.getMinutes())}`,
  };
}

/** UTC instant of local midnight at the start of `dateIso` in `tz`. */
export function startOfDayInTz(dateIso: string, tz: string): Date {
  return zonedToUtc(dateIso, "00:00", tz);
}

/** UTC instant of local midnight at the start of the day AFTER `dateIso` in `tz` (exclusive end of the day). */
export function endOfDayInTz(dateIso: string, tz: string): Date {
  return zonedToUtc(addDays(dateIso, 1), "00:00", tz);
}

/** Convenience: today plus `n` days in the tenant time zone. */
export function todayPlusInTz(tz: string, n: number, now: Date | number = Date.now()): string {
  return addDays(todayInTz(tz, now), n);
}
