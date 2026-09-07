/**
 * IANA timezone list for the signup / tenant settings searchable Select (docs/M1_SPEC.md §3, §6.8).
 * ICU reports some zones under legacy names (Asia/Calcutta); we present the modern IANA names and accept both.
 */
export const DEFAULT_TIMEZONE = "Asia/Kolkata";

const MODERN_NAMES: Record<string, string> = {
  "Asia/Calcutta": "Asia/Kolkata",
  "Asia/Saigon": "Asia/Ho_Chi_Minh",
  "Asia/Rangoon": "Asia/Yangon",
  "Europe/Kiev": "Europe/Kyiv",
  "Asia/Katmandu": "Asia/Kathmandu",
};

let cached: string[] | null = null;

/** Sorted, de-duplicated list of timezone ids; always contains DEFAULT_TIMEZONE and UTC. */
export function timeZoneOptions(): string[] {
  if (cached) return cached;
  const supported: string[] =
    typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : [DEFAULT_TIMEZONE, "UTC"];
  const set = new Set<string>();
  for (const tz of supported) set.add(MODERN_NAMES[tz] ?? tz);
  set.add(DEFAULT_TIMEZONE);
  set.add("UTC");
  cached = [...set].sort((a, b) => a.localeCompare(b));
  return cached;
}

export function isValidTimeZone(tz: unknown): tz is string {
  if (typeof tz !== "string" || tz.length === 0 || tz.length > 64) return false;
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** "Asia/Kolkata" → "UTC+05:30" (offset at `at`; DST zones vary through the year). */
export function timeZoneOffsetLabel(tz: string, at: Date = new Date()): string {
  try {
    const parts = new Intl.DateTimeFormat("en", { timeZone: tz, timeZoneName: "longOffset" }).formatToParts(at);
    const off = parts.find((p) => p.type === "timeZoneName")?.value ?? "";
    return off === "GMT" ? "UTC+00:00" : off.replace(/^GMT/, "UTC");
  } catch {
    return "";
  }
}

/** "Asia/Kolkata" → "Asia/Kolkata (UTC+05:30)" for display. */
export function timeZoneLabel(tz: string, at: Date = new Date()): string {
  const off = timeZoneOffsetLabel(tz, at);
  return off ? `${tz} (${off})` : tz;
}
