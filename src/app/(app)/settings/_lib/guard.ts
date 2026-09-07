/**
 * Page-side helpers for the settings routes. `requirePagePermission` lives in src/lib/auth/guards.ts (shared by
 * every module); it is re-exported here so the settings pages keep their local import path.
 */
export { requirePagePermission } from "@/lib/auth/guards";

/** First value of a search parameter (`?x=a&x=b` → "a"). */
export function firstParam(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}
