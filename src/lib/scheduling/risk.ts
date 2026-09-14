/**
 * Delivery-risk classification (docs/M2_SPEC.md §2.6). Pure; shared by the engine and `reassessOrderRisk()`.
 *
 *   LATE     the order is open and today (tenant tz) is after the due date;
 *   DELAYED  the planned end is after the end of the due date;
 *   AT_RISK  the planned end falls in the last 10 % of the remaining lead time, or within one working day of the
 *            due date, or the order has a material shortage, or it is unscheduled with a due date inside the horizon;
 *   ON_TRACK otherwise.
 */
import type { DeliveryRisk, RiskCause } from "@/generated/prisma/enums";
import { addDays, compareDateOnly, diffDays, endOfDayInTz, startOfDayInTz, todayInTz } from "@/lib/dates";

export const RISK_ORDER: readonly DeliveryRisk[] = ["ON_TRACK", "AT_RISK", "DELAYED", "LATE"];

export const RISK_LABELS: Record<DeliveryRisk, string> = {
  ON_TRACK: "On track",
  AT_RISK: "At risk",
  DELAYED: "Delayed",
  LATE: "Late",
};

export type ShortageSummary = { code: string; shortBy: number; unit: string };

/**
 * How long a fixed (locked/started) `ScheduleEntry`'s `actualStartAt` may run behind its own `plannedStartAt`
 * before it counts as an upstream delay for `RiskCause` purposes (docs/M3_SPEC.md §2).
 */
export const UPSTREAM_DELAY_THRESHOLD_MINUTES = 60;

export type ClassifyRiskInput = {
  plannedEndAt?: Date | null;
  /** `YYYY-MM-DD` */
  dueDate: string;
  now: Date;
  tz: string;
  hasShortage: boolean;
  scheduled: boolean;
  horizonEnd: Date;
  /** Optional detail for the reason sentence. */
  shortage?: ShortageSummary | null;
  /** Machine code of the last planned step (for "… on CNC-02"). */
  lastMachineCode?: string | null;
  /** Working-day predicate used for the "within 1 working day" rule; default: every day works. */
  isWorkingDay?: (isoDate: string) => boolean;
  /**
   * docs/M3_SPEC.md §2: at least one fixed (locked/started) ScheduleEntry's `actualStartAt` runs more than
   * `UPSTREAM_DELAY_THRESHOLD_MINUTES` behind its own `plannedStartAt`. Drives `RiskCause` only — it does not
   * change the DeliveryRisk level itself. Defaults to `false`.
   */
  hasUpstreamDelay?: boolean;
};

export type RiskResult = { risk: DeliveryRisk; reason: string | null; cause: RiskCause };

/**
 * docs/M3_SPEC.md §2 precedence: MATERIAL (a shortage dominates regardless of timing) > UPSTREAM_DELAY (real
 * execution of an earlier step is already running behind plan) > CAPACITY (anything else that is not ON_TRACK) >
 * NONE. Exported so callers that already know the risk level (e.g. `run.ts`, which gets `deliveryRisk` from the
 * engine's `EngineOrderResult` instead of calling `classifyRisk()` itself) can derive the cause without
 * re-deriving the risk classification.
 */
export function riskCauseFor(risk: DeliveryRisk, hasShortage: boolean, hasUpstreamDelay: boolean): RiskCause {
  if (hasShortage) return "MATERIAL";
  if (hasUpstreamDelay) return "UPSTREAM_DELAY";
  if (risk !== "ON_TRACK") return "CAPACITY";
  return "NONE";
}

export const RISK_CAUSE_LABELS: Record<RiskCause, string> = {
  NONE: "—",
  MATERIAL: "Material shortage",
  CAPACITY: "Machine capacity",
  UPSTREAM_DELAY: "Upstream delay",
};

/** Compares two risks by severity (ON_TRACK < AT_RISK < DELAYED < LATE). */
export function riskRank(risk: DeliveryRisk): number {
  return RISK_ORDER.indexOf(risk);
}

export function isRiskEscalation(from: DeliveryRisk, to: DeliveryRisk): boolean {
  return riskRank(to) > riskRank(from) && to !== "ON_TRACK";
}

function pluralize(n: number, unit: string): string {
  return `${n} ${unit}${n === 1 ? "" : "s"}`;
}

/** "2 days", "5 hours", "30 minutes" — whole units, largest that fits. */
export function humanDuration(ms: number): string {
  const minutes = Math.round(Math.abs(ms) / 60_000);
  if (minutes < 60) return pluralize(Math.max(1, minutes), "minute");
  const hours = Math.round(minutes / 60);
  if (hours < 24) return pluralize(hours, "hour");
  return pluralize(Math.round(hours / 24), "day");
}

function formatQty(n: number): string {
  return Number(n.toFixed(3)).toString();
}

/** Previous working day before `isoDate` (steps back over non-working days, at most 14). */
function previousWorkingDay(isoDate: string, isWorkingDay: (d: string) => boolean): string {
  let d = addDays(isoDate, -1);
  for (let i = 0; i < 14 && !isWorkingDay(d); i++) d = addDays(d, -1);
  return d;
}

const onMachine = (code?: string | null) => (code ? ` on ${code}` : "");

/** Reason sentences (docs/M2_SPEC.md §2.6), e.g. "Ends 2 days after the due date on CNC-02". */
export const riskReason = {
  late(dueDate: string, today: string): string {
    const days = diffDays(dueDate, today);
    return `Past due by ${pluralize(days, "day")} (due ${dueDate})`;
  },
  delayed(plannedEndAt: Date, dueEnd: Date, lastMachineCode?: string | null): string {
    return `Ends ${humanDuration(plannedEndAt.getTime() - dueEnd.getTime())} after the due date${onMachine(lastMachineCode)}`;
  },
  tight(plannedEndAt: Date, dueEnd: Date, lastMachineCode?: string | null): string {
    const ms = dueEnd.getTime() - plannedEndAt.getTime();
    if (ms <= 0) return `Ends on the due date${onMachine(lastMachineCode)}`;
    return `Ends only ${humanDuration(ms)} before the due date${onMachine(lastMachineCode)}`;
  },
  shortage(s: ShortageSummary): string {
    return `Material ${s.code} short by ${formatQty(s.shortBy)} ${s.unit}`;
  },
  unscheduled(horizonDays: number): string {
    return `Not scheduled within the ${horizonDays}-day horizon`;
  },
  unscheduledGeneric(): string {
    return "Not scheduled within the planning horizon";
  },
};

/**
 * Classifies one order. `plannedEndAt` is the planned end of its last step (fixed or planned); `scheduled` is false
 * when the engine could not place it.
 */
export function classifyRisk(input: ClassifyRiskInput): RiskResult {
  const { tz, now, dueDate } = input;
  const today = todayInTz(tz, now);
  const dueEnd = endOfDayInTz(dueDate, tz);
  const hasUpstreamDelay = input.hasUpstreamDelay ?? false;
  const withCause = (risk: DeliveryRisk, reason: string | null): RiskResult => ({
    risk,
    reason,
    cause: riskCauseFor(risk, input.hasShortage, hasUpstreamDelay),
  });

  if (compareDateOnly(today, dueDate) > 0) {
    return withCause("LATE", riskReason.late(dueDate, today));
  }

  const end = input.scheduled && input.plannedEndAt ? input.plannedEndAt : null;
  if (end && end.getTime() > dueEnd.getTime()) {
    return withCause("DELAYED", riskReason.delayed(end, dueEnd, input.lastMachineCode));
  }

  if (input.hasShortage) {
    const reason = input.shortage ? riskReason.shortage(input.shortage) : "Material shortage";
    return withCause("AT_RISK", reason);
  }

  if (!end) {
    if (dueEnd.getTime() <= input.horizonEnd.getTime()) {
      const horizonDays = Math.round((input.horizonEnd.getTime() - startOfDayInTz(today, tz).getTime()) / 86_400_000);
      return withCause("AT_RISK", horizonDays > 0 ? riskReason.unscheduled(horizonDays) : riskReason.unscheduledGeneric());
    }
    return withCause("ON_TRACK", null);
  }

  // Last 10 % of the remaining lead time (measured from now to the end of the due date).
  const lead = dueEnd.getTime() - now.getTime();
  const tightFrom = dueEnd.getTime() - Math.max(0, lead) * 0.1;
  // Within one working day of the due date: the planned end is on the due date or the previous working day.
  const isWorking = input.isWorkingDay ?? (() => true);
  const oneWorkingDayFrom = startOfDayInTz(previousWorkingDay(dueDate, isWorking), tz).getTime();
  if (end.getTime() >= tightFrom || end.getTime() >= oneWorkingDayFrom) {
    return withCause("AT_RISK", riskReason.tight(end, dueEnd, input.lastMachineCode));
  }
  return withCause("ON_TRACK", null);
}
