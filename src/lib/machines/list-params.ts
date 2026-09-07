/**
 * List URL contract helpers (docs/M1_SPEC.md §5 "List URL contract"): `q`, `page` (1-based, 25/page), `sort`,
 * `dir` plus module filters. Pure; shared by the machines, work-centers and calendars lists.
 */
export type SortDir = "asc" | "desc";

/** The shape of `await searchParams` in a Server Component page. */
export type SearchParams = Record<string, string | string[] | undefined>;

export const PAGE_SIZE = 25;
export const MAX_QUERY_LENGTH = 120;

/** First value of a possibly repeated query key, trimmed; `undefined` when absent or blank. */
export function firstParam(sp: SearchParams, key: string): string | undefined {
  const raw = sp[key];
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

/** Search text, trimmed and length-capped. */
export function parseQuery(sp: SearchParams): string {
  return (firstParam(sp, "q") ?? "").slice(0, MAX_QUERY_LENGTH);
}

/** 1-based page number; anything invalid → 1. */
export function parsePage(sp: SearchParams): number {
  const n = Number(firstParam(sp, "page"));
  return Number.isInteger(n) && n >= 1 ? Math.min(n, 100_000) : 1;
}

export function parseSortDir(sp: SearchParams, fallback: SortDir): SortDir {
  const v = firstParam(sp, "dir");
  return v === "asc" || v === "desc" ? v : fallback;
}

/** Sort key restricted to the allowed column keys of a list. */
export function parseSort<T extends string>(sp: SearchParams, allowed: readonly T[], fallback: T): T {
  const v = firstParam(sp, "sort");
  return v !== undefined && (allowed as readonly string[]).includes(v) ? (v as T) : fallback;
}

/** `?includeInactive=1` style flags. */
export function parseFlag(sp: SearchParams, key: string): boolean {
  const v = firstParam(sp, key);
  return v === "1" || v === "true" || v === "on";
}

/** Skip/take for Prisma from a 1-based page. */
export function pageSlice(page: number, pageSize = PAGE_SIZE): { skip: number; take: number } {
  return { skip: (Math.max(1, page) - 1) * pageSize, take: pageSize };
}

export type QueryValue = string | number | boolean | null | undefined;

/**
 * Serialises list params to a query string. Blank strings, `null`, `undefined`, `false` and `page: 1` are dropped
 * so canonical URLs stay short; `true` becomes `1`.
 */
export function toQuery(params: Record<string, QueryValue>): string {
  const out = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === false || value === "") continue;
    if (key === "page" && Number(value) <= 1) continue;
    out.set(key, value === true ? "1" : String(value));
  }
  return out.toString();
}

/** `/machines?workCenterId=…` — path plus the query string when it is non-empty. */
export function listUrl(path: string, params: Record<string, QueryValue>): string {
  const query = toQuery(params);
  return query ? `${path}?${query}` : path;
}

/** Case-insensitive "contains" filter for Prisma string columns. */
export function containsInsensitive(q: string): { contains: string; mode: "insensitive" } {
  return { contains: q, mode: "insensitive" };
}
