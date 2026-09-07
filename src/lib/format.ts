/**
 * Display formatting (docs/M1_SPEC.md §5 "Dates in UI").
 *
 * Calendar dates render as `05 Sep 2026`, timestamps as `05 Sep 2026, 14:30` in the tenant timezone (24 h), relative
 * time as `2 h ago`. Month names are fixed English abbreviations (Intl's en-GB says "Sept", which would drift between
 * runtimes). All formatting is meant to happen in Server Components so client components receive strings.
 */
import { TZDate } from "@date-fns/tz";
import { isIsoDate, isValidTimeZone, parseDateOnly, toDateOnly } from "./dates";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

const pad2 = (n: number) => String(n).padStart(2, "0");

/** Number-like inputs: JS numbers, numeric strings and Prisma Decimal (anything with a numeric toString()). */
export type NumberLike = number | string | { toString(): string };

/** Converts a NumberLike to a finite number; returns NaN for anything unparsable (callers decide how to render). */
export function toNumberLike(v: NumberLike | null | undefined): number {
  if (v === null || v === undefined) return NaN;
  if (typeof v === "number") return v;
  const s = String(v).trim();
  if (s === "") return NaN;
  return Number(s);
}

function toMs(v: Date | number | string): number {
  const ms = v instanceof Date ? v.getTime() : typeof v === "number" ? v : new Date(v).getTime();
  return ms;
}

/** `2026-09-05` or a UTC-midnight Date (as returned for `@db.Date` columns) → `05 Sep 2026`. Empty for null/invalid. */
export function formatDate(v: string | Date | null | undefined): string {
  if (v === null || v === undefined || v === "") return "";
  let iso: string;
  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) return "";
    iso = toDateOnly(v);
  } else if (isIsoDate(v)) {
    iso = v;
  } else {
    // A full ISO timestamp string: fall back to its UTC calendar day.
    const ms = new Date(v).getTime();
    if (!Number.isFinite(ms)) return "";
    iso = toDateOnly(new Date(ms));
  }
  const { year, month, day } = parseDateOnly(iso);
  return `${pad2(day)} ${MONTHS[month - 1]} ${year}`;
}

/** Instant → `05 Sep 2026, 14:30` on a clock in `tz` (24 h). Empty for null/invalid. */
export function formatDateTime(d: Date | string | number | null | undefined, tz: string): string {
  if (d === null || d === undefined || d === "") return "";
  const ms = toMs(d);
  if (!Number.isFinite(ms) || !isValidTimeZone(tz)) return "";
  const z = new TZDate(ms, tz);
  return `${pad2(z.getDate())} ${MONTHS[z.getMonth()]} ${z.getFullYear()}, ${pad2(z.getHours())}:${pad2(z.getMinutes())}`;
}

/** Instant → `14:30` on a clock in `tz`. Empty for null/invalid. */
export function formatTime(d: Date | string | number | null | undefined, tz: string): string {
  if (d === null || d === undefined || d === "") return "";
  const ms = toMs(d);
  if (!Number.isFinite(ms) || !isValidTimeZone(tz)) return "";
  const z = new TZDate(ms, tz);
  return `${pad2(z.getHours())}:${pad2(z.getMinutes())}`;
}

/**
 * Relative time for activity feeds: `just now`, `5 min ago`, `2 h ago`, `3 d ago` (and `in 2 h` for future instants).
 * Beyond 7 days it falls back to the absolute date (`05 Sep 2026`, or the tenant-tz timestamp when `tz` is given).
 * `now` is injectable for tests and for consistent rendering within one request.
 */
export function formatRelative(d: Date | string | number, now: Date | number = Date.now(), tz?: string): string {
  const ms = toMs(d);
  const nowMs = toMs(now);
  if (!Number.isFinite(ms) || !Number.isFinite(nowMs)) return "";
  const diff = nowMs - ms; // positive = past
  const abs = Math.abs(diff);
  const sec = Math.round(abs / 1000);
  if (sec < 45) return "just now";
  const suffix = (s: string) => (diff >= 0 ? `${s} ago` : `in ${s}`);
  const min = Math.round(abs / 60_000);
  if (min < 60) return suffix(`${Math.max(1, min)} min`);
  const hours = Math.round(abs / 3_600_000);
  if (hours < 24) return suffix(`${hours} h`);
  const days = Math.round(abs / 86_400_000);
  if (days < 7) return suffix(`${Math.max(1, days)} d`);
  return tz ? formatDateTime(ms, tz) : formatDate(new Date(ms));
}

/** Number with thousands separators and up to `maxFractionDigits` decimals (trailing zeros dropped). */
export function formatNumber(n: NumberLike | null | undefined, maxFractionDigits = 3): string {
  const v = toNumberLike(n);
  if (!Number.isFinite(v)) return "";
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: maxFractionDigits }).format(v);
}

/** Integer with thousands separators (rounds). */
export function formatInt(n: NumberLike | null | undefined): string {
  const v = toNumberLike(n);
  if (!Number.isFinite(v)) return "";
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(v);
}

/** Quantity (≤ 3 dp) with an optional unit suffix: `formatQty("12.500", "kg")` → `12.5 kg`. */
export function formatQty(n: NumberLike | null | undefined, unit?: string | null): string {
  const num = formatNumber(n, 3);
  if (num === "") return "";
  const u = unit?.trim();
  return u ? `${num} ${u}` : num;
}

/** Signed quantity for stock ledgers: `+12.5 kg` / `−3 kg` (U+2212 minus). */
export function formatSignedQty(n: NumberLike | null | undefined, unit?: string | null): string {
  const v = toNumberLike(n);
  if (!Number.isFinite(v)) return "";
  const body = formatQty(Math.abs(v), unit);
  return v < 0 ? `−${body}` : `+${body}`;
}

/** Duration in minutes → `45 min`, `1 h`, `1 h 30 min`. Negative/invalid → `0 min`. */
export function formatMinutes(n: NumberLike | null | undefined): string {
  const v = Math.round(toNumberLike(n));
  if (!Number.isFinite(v) || v <= 0) return "0 min";
  if (v < 60) return `${v} min`;
  const h = Math.floor(v / 60);
  const m = v % 60;
  return m === 0 ? `${formatInt(h)} h` : `${formatInt(h)} h ${m} min`;
}

/** `85` → `85%` (up to 1 decimal). */
export function formatPercent(n: NumberLike | null | undefined): string {
  const num = formatNumber(n, 1);
  return num === "" ? "" : `${num}%`;
}

/** `formatDays(3)` → `3d`. */
export function formatDays(n: number): string {
  return `${Math.round(Math.abs(n))}d`;
}
