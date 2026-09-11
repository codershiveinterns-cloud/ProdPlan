/**
 * `/schedule` URL params (docs/M2_SPEC.md §3): `?from=YYYY-MM-DD&days=7|14|30&workCenterId=`. Default `from` = today
 * in the tenant timezone, default `days` = 14. Pure — no `next/navigation` import — so it is safe from both the
 * Server Component page and the client toolbar that builds hrefs for the window-nav links.
 */
import { BOARD_WINDOW_DAY_OPTIONS, boardWindowSchema, type BoardWindowParams } from "@/lib/validation/scheduling";
import { addDays, isIsoDate } from "@/lib/dates";

export type ScheduleSearchParams = Record<string, string | string[] | undefined>;

function first(sp: ScheduleSearchParams, key: string): string | undefined {
  const raw = sp[key];
  const value = Array.isArray(raw) ? raw[0] : raw;
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}

/** Parses `?from=&days=&workCenterId=`, defaulting `from` to `todayIso` and `days` to 14 (spec §3). */
export function parseBoardParams(sp: ScheduleSearchParams, todayIso: string): BoardWindowParams {
  const fromRaw = first(sp, "from");
  const from = fromRaw && isIsoDate(fromRaw) ? fromRaw : todayIso;
  return boardWindowSchema.parse({
    from,
    days: first(sp, "days"),
    workCenterId: first(sp, "workCenterId"),
  });
}

export { BOARD_WINDOW_DAY_OPTIONS };

/** Builds an `/schedule?...` href, merging `patch` over the current params. */
export function boardHref(params: BoardWindowParams, patch: Partial<BoardWindowParams>): string {
  const merged = { ...params, ...patch };
  const q = new URLSearchParams();
  q.set("from", merged.from);
  q.set("days", String(merged.days));
  if (merged.workCenterId) q.set("workCenterId", merged.workCenterId);
  return `/schedule?${q.toString()}`;
}

/** `/schedule/conflicts` href for a row's "Open on board" action. */
export function boardHrefForDate(fromIso: string, days: number, workCenterId?: string | null): string {
  const q = new URLSearchParams();
  q.set("from", fromIso);
  q.set("days", String(days));
  if (workCenterId) q.set("workCenterId", workCenterId);
  return `/schedule?${q.toString()}`;
}

/** Previous/next window navigation (shifts by a full window width). */
export function shiftWindow(params: BoardWindowParams, direction: -1 | 1): BoardWindowParams {
  return { ...params, from: addDays(params.from, direction * params.days) };
}
