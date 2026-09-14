/**
 * Manager analytics dashboard queries (docs/M3_SPEC.md §5, "Engineer B"). Every export here is a pure,
 * tenant-scoped read — no mutation, no N+1: `loadAnalytics()` batches its DB round trips with `Promise.all`.
 *
 * Machine utilisation reuses `loadBoardWindow()` from `src/lib/scheduling/queries.ts` verbatim (the same
 * occupied/available-minutes formula the planning board uses) rather than a second implementation, per spec.
 * `src/lib/analytics/shortage.ts` (Engineer A's `predictShortages()`) is imported by the `/analytics` page
 * directly, not from this file — this file only owns the KPI/utilisation/trend/throughput queries.
 */
import type { OrderPriority } from "@/generated/prisma/enums";
import { addDays, compareDateOnly, endOfDayInTz, startOfDayInTz, toDateOnly, utcToZonedParts, weekdayOf } from "@/lib/dates";
import type { TenantDb } from "@/lib/db";
import { AT_RISK_DELIVERY_RISKS } from "@/lib/dashboard/queries";
import { OPEN_STATUSES } from "@/lib/orders/kpis";
import { loadBoardWindow } from "@/lib/scheduling/queries";

/** Date-range presets offered by the page's selector (spec §5: "presets 7/30/90 days"). */
export const ANALYTICS_RANGE_PRESETS = [7, 30, 90] as const;
export type AnalyticsRangePreset = (typeof ANALYTICS_RANGE_PRESETS)[number];
export const DEFAULT_ANALYTICS_RANGE_DAYS: AnalyticsRangePreset = 30;

/** Utilisation/shortage sections are always "now" over this many days forward — a snapshot, not historical (spec §5). */
export const UTILISATION_WINDOW_DAYS = 7;

export type AnalyticsRange = { from: string; to: string };

export type AnalyticsKpis = {
  /** % of COMPLETED orders in range with `completedAt` on or before the end of their due date; null if none completed (render "—"). */
  onTimeDeliveryRate: number | null;
  /** COMPLETED order count in range. */
  throughput: number;
  /** Open orders (QUEUED/IN_PROGRESS/ON_HOLD) with deliveryRisk AT_RISK/DELAYED/LATE — live, not range-bound. */
  openOrdersAtRisk: number;
  /** Mean per-machine utilisation % over the next `UTILISATION_WINDOW_DAYS` days. */
  avgMachineUtilisation: number;
};

export type MachineUtilisationRow = {
  id: string;
  code: string;
  name: string;
  workCenterId: string;
  workCenterCode: string;
  utilisationPercent: number;
};

/** One Monday-start ISO week within the trend range. */
export type OnTimeTrendWeek = {
  /** `YYYY-MM-DD`, the Monday the week starts on. */
  weekStart: string;
  completed: number;
  onTime: number;
  /** null when `completed` is 0 (rendered as an empty/"—" bar, never divide by zero). */
  onTimePercent: number | null;
};

export const THROUGHPUT_PRIORITIES: readonly OrderPriority[] = ["URGENT", "HIGH", "NORMAL", "LOW"];

export type ThroughputByPriority = Record<OrderPriority, number>;

export type AnalyticsData = {
  range: AnalyticsRange;
  kpis: AnalyticsKpis;
  /** Sorted highest utilisation first (spec §5.2). */
  machineUtilisation: MachineUtilisationRow[];
  /** Every Monday-start week touching `range`, in chronological order (spec §5.3). */
  trend: OnTimeTrendWeek[];
  throughputByPriority: ThroughputByPriority;
};

export type LoadAnalyticsOptions = {
  range: AnalyticsRange;
  tz: string;
  /** `todayInTz(tz)` — the start of the machine-utilisation window (next `UTILISATION_WINDOW_DAYS` days from today). */
  today: string;
};

/** Monday-start of the ISO week containing `iso` (`weekdayOf`: 0 = Sunday … 6 = Saturday). */
function mondayStart(iso: string): string {
  const wd = weekdayOf(iso);
  const daysSinceMonday = wd === 0 ? 6 : wd - 1;
  return addDays(iso, -daysSinceMonday);
}

function emptyThroughputByPriority(): ThroughputByPriority {
  return { URGENT: 0, HIGH: 0, NORMAL: 0, LOW: 0 };
}

/**
 * Everything the `/analytics` page renders except `predictShortages()` (owned by Engineer A's `shortage.ts`,
 * called separately by the page). Three DB round trips in parallel: completed-orders-in-range, the live at-risk
 * count, and `loadBoardWindow` for utilisation — all remaining aggregation (on-time rate, weekly trend, throughput
 * by priority) happens in memory from the single `completedRows` read, so there is no per-row follow-up query.
 */
export async function loadAnalytics(db: TenantDb, opts: LoadAnalyticsOptions): Promise<AnalyticsData> {
  const { range, tz, today } = opts;
  const rangeStart = startOfDayInTz(range.from, tz);
  const rangeEnd = endOfDayInTz(range.to, tz); // exclusive: start of the day AFTER `range.to`

  const [completedRows, openOrdersAtRisk, utilWindow] = await Promise.all([
    db.order.findMany({
      where: { status: "COMPLETED", completedAt: { gte: rangeStart, lt: rangeEnd } },
      select: { completedAt: true, dueDate: true, priority: true },
    }),
    db.order.count({ where: { status: { in: [...OPEN_STATUSES] }, deliveryRisk: { in: [...AT_RISK_DELIVERY_RISKS] } } }),
    loadBoardWindow(db, { from: today, days: UTILISATION_WINDOW_DAYS, tz }),
  ]);

  let onTimeCount = 0;
  const throughputByPriority = emptyThroughputByPriority();
  const weekBuckets = new Map<string, { completed: number; onTime: number }>();

  for (const o of completedRows) {
    if (!o.completedAt) continue; // status COMPLETED implies completedAt is set; guard kept for type safety only.
    const dueEnd = endOfDayInTz(toDateOnly(o.dueDate), tz);
    const onTime = o.completedAt.getTime() <= dueEnd.getTime();
    if (onTime) onTimeCount++;
    throughputByPriority[o.priority]++;

    const localDate = utcToZonedParts(o.completedAt, tz).date;
    const weekStart = mondayStart(localDate);
    const bucket = weekBuckets.get(weekStart) ?? { completed: 0, onTime: 0 };
    bucket.completed++;
    if (onTime) bucket.onTime++;
    weekBuckets.set(weekStart, bucket);
  }

  const throughput = completedRows.length;
  const onTimeDeliveryRate = throughput > 0 ? Math.round((onTimeCount / throughput) * 100) : null;

  // Every Monday-start week touching the range, including weeks with zero completions (continuous bar chart).
  const trend: OnTimeTrendWeek[] = [];
  for (let w = mondayStart(range.from); compareDateOnly(w, range.to) <= 0; w = addDays(w, 7)) {
    const bucket = weekBuckets.get(w) ?? { completed: 0, onTime: 0 };
    trend.push({
      weekStart: w,
      completed: bucket.completed,
      onTime: bucket.onTime,
      onTimePercent: bucket.completed > 0 ? Math.round((bucket.onTime / bucket.completed) * 100) : null,
    });
  }

  const machineUtilisation: MachineUtilisationRow[] = utilWindow.workCenters
    .flatMap((wc) =>
      wc.machines.map((m) => ({
        id: m.id,
        code: m.code,
        name: m.name,
        workCenterId: wc.id,
        workCenterCode: wc.code,
        utilisationPercent: m.utilisationPercent,
      })),
    )
    .sort((a, b) => b.utilisationPercent - a.utilisationPercent || a.code.localeCompare(b.code));

  const avgMachineUtilisation =
    machineUtilisation.length > 0
      ? Math.round(machineUtilisation.reduce((sum, m) => sum + m.utilisationPercent, 0) / machineUtilisation.length)
      : 0;

  return {
    range,
    kpis: { onTimeDeliveryRate, throughput, openOrdersAtRisk, avgMachineUtilisation },
    machineUtilisation,
    trend,
    throughputByPriority,
  };
}
