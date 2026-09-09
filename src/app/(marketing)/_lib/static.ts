/**
 * Static landing export (scripts/export-landing.mjs). When STATIC_LANDING=1 the marketing page is rendered as a
 * standalone site: every link into the product points at APP_URL (the hosted application) and the one-click demo
 * buttons become links to the sign-in page, where the demo profiles live.
 */
export const STATIC_LANDING = process.env.STATIC_LANDING === "1";

const APP_URL = (process.env.APP_URL ?? "").replace(/\/$/, "");

export function appHref(path: string): string {
  return STATIC_LANDING ? `${APP_URL}${path}` : path;
}
