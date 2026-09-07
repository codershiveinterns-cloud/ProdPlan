/**
 * "Capacity — next 7 days" table for the machine detail page (docs/M1_SPEC.md §6.2), built from
 * `availabilityRange()` in `src/lib/calendar.ts` and pre-formatted in the tenant timezone so the page can render
 * plain strings.
 */
import {
  availabilityRange,
  dailyCapacityMinutes,
  DAY_LABELS,
  type Calendar,
  type DayAvailability,
  type Downtime,
} from "@/lib/calendar";
import { formatDate, formatTime } from "@/lib/format";

export const CAPACITY_DAYS = 7;

export type CapacityShiftRow = {
  shiftId: string;
  name: string;
  /** "06:00–14:00" in the tenant timezone. */
  timeLabel: string;
  netMinutes: number;
  effectiveMinutes: number;
  downtimeMinutes: number;
  availableMinutes: number;
};

export type CapacityDayRow = {
  date: string;
  /** "07 Sep 2026" */
  dateLabel: string;
  /** "Mon" */
  dayLabel: string;
  isWorking: boolean;
  /** "Non-working (Holiday: Diwali)" for a non-working day, else null. */
  nonWorkingLabel: string | null;
  shifts: CapacityShiftRow[];
  totalNet: number;
  totalEffective: number;
  totalDowntime: number;
  totalAvailable: number;
};

export type CapacityTable = {
  fromDate: string;
  toDate: string;
  days: CapacityDayRow[];
  totals: { net: number; effective: number; downtime: number; available: number };
  efficiencyPercent: number;
};

export function nonWorkingLabel(day: DayAvailability): string | null {
  if (day.isWorking) return null;
  const ex = day.exception;
  if (ex && !ex.isWorking) {
    const note = ex.note?.trim();
    return note ? `Non-working (${note})` : "Non-working (exception)";
  }
  return "Non-working";
}

function toDayRow(day: DayAvailability, tz: string): CapacityDayRow {
  return {
    date: day.date,
    dateLabel: formatDate(day.date),
    dayLabel: DAY_LABELS[day.weekday],
    isWorking: day.isWorking,
    nonWorkingLabel: nonWorkingLabel(day),
    shifts: day.shifts.map((s) => ({
      shiftId: s.shiftId,
      name: s.name,
      timeLabel: `${formatTime(s.startsAt, tz)}–${formatTime(s.endsAt, tz)}`,
      netMinutes: s.netMinutes,
      effectiveMinutes: s.effectiveMinutes,
      downtimeMinutes: s.downtimeMinutes,
      availableMinutes: s.availableMinutes,
    })),
    totalNet: day.totalNet,
    totalEffective: day.totalEffective,
    totalDowntime: day.totalDowntime,
    totalAvailable: day.totalAvailable,
  };
}

/** Availability for `days` consecutive dates starting at `fromIso` (today in the tenant timezone). */
export function buildCapacityTable(
  machine: { efficiencyPercent: number },
  calendar: Calendar,
  downtimes: readonly Downtime[],
  fromIso: string,
  tz: string,
  days = CAPACITY_DAYS,
): CapacityTable {
  const range = availabilityRange(machine, calendar, downtimes, fromIso, days, tz);
  const rows = range.map((d) => toDayRow(d, tz));
  return {
    fromDate: fromIso,
    toDate: rows[rows.length - 1]?.date ?? fromIso,
    days: rows,
    totals: {
      net: rows.reduce((s, d) => s + d.totalNet, 0),
      effective: rows.reduce((s, d) => s + d.totalEffective, 0),
      downtime: rows.reduce((s, d) => s + d.totalDowntime, 0),
      available: rows.reduce((s, d) => s + d.totalAvailable, 0),
    },
    efficiencyPercent: range[0]?.efficiencyPercent ?? machine.efficiencyPercent,
  };
}

/** Standard-day capacity of a machine: nominal net shift minutes × efficiency (no exceptions/downtime). */
export function machineDailyCapacity(
  machine: { efficiencyPercent: number },
  calendar: Pick<Calendar, "shifts">,
): number {
  return Math.round((dailyCapacityMinutes(calendar) * machine.efficiencyPercent) / 100);
}
