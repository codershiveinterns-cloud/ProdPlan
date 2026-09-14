/**
 * `/analytics` URL params (docs/M3_SPEC.md §5): `?from=&to=`, defaulting to the trailing `DEFAULT_ANALYTICS_RANGE_DAYS`
 * days, with 7/30/90-day presets. Pure — no `next/navigation` import — so it is safe to use from the page and the
 * client-free preset links alike, matching the `/schedule` board's `params.ts` pattern.
 */
import { addDays, isIsoDate } from "@/lib/dates";
import { ANALYTICS_RANGE_PRESETS, DEFAULT_ANALYTICS_RANGE_DAYS, type AnalyticsRange, type AnalyticsRangePreset } from "@/lib/analytics/dashboard";

export { ANALYTICS_RANGE_PRESETS };

export type AnalyticsSearchParams = Record<string, string | string[] | undefined>;

function first(sp: AnalyticsSearchParams, key: string): string | undefined {
  const raw = sp[key];
  const value = Array.isArray(raw) ? raw[0] : raw;
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}

function defaultRange(todayIso: string): AnalyticsRange {
  return { from: addDays(todayIso, -(DEFAULT_ANALYTICS_RANGE_DAYS - 1)), to: todayIso };
}

/**
 * Parses `?from=&to=`. Falls back to the default trailing range whenever either bound is missing, not a valid
 * `YYYY-MM-DD`, or `from` is after `to` — never throws on a malformed query string.
 */
export function parseAnalyticsRange(sp: AnalyticsSearchParams, todayIso: string): AnalyticsRange {
  const fromRaw = first(sp, "from");
  const toRaw = first(sp, "to");
  const from = fromRaw && isIsoDate(fromRaw) ? fromRaw : undefined;
  const to = toRaw && isIsoDate(toRaw) ? toRaw : undefined;
  if (from && to && from <= to) return { from, to };
  return defaultRange(todayIso);
}

/** `/analytics?from=&to=` href for a trailing-N-day preset ending today. */
export function analyticsPresetHref(preset: AnalyticsRangePreset, todayIso: string): string {
  const q = new URLSearchParams({ from: addDays(todayIso, -(preset - 1)), to: todayIso });
  return `/analytics?${q.toString()}`;
}

/** True when `range` exactly matches the trailing-N-day preset ending today (drives the selector's active state). */
export function isActivePreset(range: AnalyticsRange, preset: AnalyticsRangePreset, todayIso: string): boolean {
  return range.from === addDays(todayIso, -(preset - 1)) && range.to === todayIso;
}
