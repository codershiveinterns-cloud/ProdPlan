/**
 * Working-window maths shared by the engine (`engine.ts`) and drag-to-reschedule (`move.ts`).
 *
 * Every interval is a half-open `[s, e)` in epoch milliseconds. Working windows come from `shiftsOn()` in the
 * tenant timezone; a shift's break is taken in the MIDDLE of the shift (whole minutes), so a shift with a break
 * yields two working windows. Free time = working windows − downtime − occupied intervals.
 */
import { shiftsOn, type Calendar, type Downtime } from "@/lib/calendar";
import { addDays, diffDays } from "@/lib/dates";

export const MINUTE_MS = 60_000;

export type Interval = { s: number; e: number };

const toMs = (v: Date | string | number): number => (v instanceof Date ? v.getTime() : new Date(v).getTime());

/** Rounds an instant UP to the next multiple of `minutes` (an instant already on the grid is unchanged). */
export function ceilToMinutes(d: Date | number, minutes: number): Date {
  const step = minutes * MINUTE_MS;
  const ms = toMs(d);
  return new Date(Math.ceil(ms / step) * step);
}

/** Rounds an instant to the NEAREST multiple of `minutes` (halfway rounds up). */
export function roundToMinutes(d: Date | number, minutes: number): Date {
  const step = minutes * MINUTE_MS;
  return new Date(Math.round(toMs(d) / step) * step);
}

/** Sorts by start and merges overlapping or touching intervals. Drops empty ones. */
export function normalizeIntervals(intervals: readonly Interval[]): Interval[] {
  const sorted = intervals.filter((i) => i.e > i.s).sort((a, b) => a.s - b.s || a.e - b.e);
  const out: Interval[] = [];
  for (const i of sorted) {
    const last = out[out.length - 1];
    if (last && i.s <= last.e) {
      if (i.e > last.e) last.e = i.e;
    } else {
      out.push({ s: i.s, e: i.e });
    }
  }
  return out;
}

/** `free − busy` for one busy interval; `free` must be sorted and non-overlapping. Returns a new array. */
export function subtractInterval(free: readonly Interval[], busy: Interval): Interval[] {
  if (busy.e <= busy.s) return free.slice();
  const out: Interval[] = [];
  for (const w of free) {
    if (w.e <= busy.s || w.s >= busy.e) {
      out.push(w);
      continue;
    }
    if (w.s < busy.s) out.push({ s: w.s, e: busy.s });
    if (w.e > busy.e) out.push({ s: busy.e, e: w.e });
  }
  return out;
}

export function subtractIntervals(free: readonly Interval[], busies: readonly Interval[]): Interval[] {
  let out = free.slice();
  for (const b of busies) out = subtractInterval(out, b);
  return out;
}

/** Total minutes covered by (normalized) intervals. */
export function totalMinutes(intervals: readonly Interval[]): number {
  return Math.round(intervals.reduce((sum, i) => sum + (i.e - i.s), 0) / MINUTE_MS);
}

/** Minutes of `[s, e)` that fall inside `intervals` (sorted, non-overlapping). */
export function coveredMinutes(intervals: readonly Interval[], s: number, e: number): number {
  let total = 0;
  for (const i of intervals) {
    if (i.e <= s) continue;
    if (i.s >= e) break;
    total += Math.min(i.e, e) - Math.max(i.s, s);
  }
  return Math.round(total / MINUTE_MS);
}

/** Working windows of ONE calendar day (shift instances starting that day), break split out of the middle. */
export function dayWorkingWindows(calendar: Calendar, isoDate: string, tz: string, withBreaks = true): Interval[] {
  const out: Interval[] = [];
  for (const inst of shiftsOn(calendar, isoDate, tz)) {
    const s = inst.startsAt.getTime();
    const e = inst.endsAt.getTime();
    const breakMs = Math.min(inst.grossMinutes, Math.max(0, inst.breakMinutes)) * MINUTE_MS;
    if (!withBreaks || breakMs <= 0) {
      out.push({ s, e });
      continue;
    }
    const firstLen = Math.floor((e - s - breakMs) / 2 / MINUTE_MS) * MINUTE_MS;
    out.push({ s, e: s + firstLen });
    out.push({ s: s + firstLen + breakMs, e });
  }
  return out;
}

/**
 * Working windows between `fromIso` (inclusive) and `toIso` (exclusive) in `tz`, clipped to `[clipStart, clipEnd)`
 * when given. The day BEFORE `fromIso` is included so a night shift that started the previous evening still counts.
 */
export function workingWindows(
  calendar: Calendar,
  tz: string,
  fromIso: string,
  toIso: string,
  opts: { withBreaks?: boolean; clipStart?: number; clipEnd?: number } = {},
): Interval[] {
  const days = diffDays(fromIso, toIso);
  const raw: Interval[] = [];
  for (let i = -1; i < days; i++) {
    raw.push(...dayWorkingWindows(calendar, addDays(fromIso, i), tz, opts.withBreaks ?? true));
  }
  const clipS = opts.clipStart ?? Number.NEGATIVE_INFINITY;
  const clipE = opts.clipEnd ?? Number.POSITIVE_INFINITY;
  return normalizeIntervals(raw.map((w) => ({ s: Math.max(w.s, clipS), e: Math.min(w.e, clipE) })));
}

export function downtimeIntervals(downtime: readonly Downtime[]): Interval[] {
  return normalizeIntervals(downtime.map((d) => ({ s: toMs(d.startsAt), e: toMs(d.endsAt) })));
}

export type Placement = { start: number; end: number };

/**
 * Places `minutes` of work into `free` (sorted, non-overlapping) starting no earlier than `earliest`. Work may span
 * several windows — a gap between two `free` windows is normally just non-working time (a shift boundary, a
 * weekend, a break), and it is fine for one entry to span it; `end` is the real finish instant. Returns null when
 * the windows cannot hold the work.
 *
 * `blocking` (optional) marks time that is busy with a DIFFERENT job already committed on this machine (state on
 * the machine, not a working-time boundary). A placement must never bridge across a `blocking` interval: doing so
 * would persist one `ScheduleEntry` row whose outer `[start, end)` window visually and logically overlaps another
 * order's entry, even though the two entries' actual minutes don't collide. When accumulating would require
 * crossing a `blocking` interval, the search restarts from the window on the far side of it instead.
 */
export function placeWork(free: readonly Interval[], earliest: number, minutes: number, blocking: readonly Interval[] = []): Placement | null {
  let need = Math.max(0, minutes) * MINUTE_MS;
  let start = -1;
  let prevEnd = -1;
  for (const w of free) {
    if (w.e <= earliest) continue;
    const s = Math.max(w.s, earliest);
    if (start >= 0 && prevEnd >= 0 && blocking.some((b) => b.e > prevEnd && b.s < s)) {
      // The gap since the last window we used is occupied by another order's job, not just non-working time —
      // this placement cannot bridge it. Start over from this window.
      need = Math.max(0, minutes) * MINUTE_MS;
      start = -1;
    }
    if (start < 0) {
      start = s;
      if (need === 0) return { start, end: start };
    }
    const usable = w.e - s;
    if (usable >= need) return { start, end: s + need };
    need -= usable;
    prevEnd = w.e;
  }
  return null;
}

/** First working instant at or after `at` (null when there is none in `free`). */
export function nextWorkingInstant(free: readonly Interval[], at: number): number | null {
  for (const w of free) {
    if (w.e <= at) continue;
    return Math.max(w.s, at);
  }
  return null;
}
