/**
 * Shared zod v4 building blocks for form/action/import validation. Every message is user-facing.
 *
 * Inputs arrive from `parseForm()` as strings (or string[] for repeated keys, or undefined). Helpers here are tolerant
 * of "", whitespace, null and undefined so that blank optional fields become `undefined` and blank required fields
 * produce a clear "X is required" message rather than a type error.
 */
import { z } from "zod";
import { isValidTimeZone } from "@/lib/dates";

/** Control characters that are never allowed in single-line text (C0 controls + DEL). */
const SINGLE_LINE_CONTROL_RE = /[\u0000-\u001F\u007F]/;
/** Control characters never allowed in multi-line text (newline and carriage return are permitted). */
const MULTI_LINE_CONTROL_RE = /[\u0000-\u0009\u000B\u000C\u000E-\u001F\u007F]/;

export function hasControlChars(s: string, allowNewlines = false): boolean {
  return (allowNewlines ? MULTI_LINE_CONTROL_RE : SINGLE_LINE_CONTROL_RE).test(s);
}

/** Blank strings, null and undefined → undefined (so `.optional()` / `.default()` kick in). */
export function emptyToUndefined(v: unknown): unknown {
  if (v === null || v === undefined) return undefined;
  if (typeof v === "string" && v.trim() === "") return undefined;
  return v;
}

/** Repeated form keys arrive as arrays; take the last value (hidden "false" + checked "on" → "on"). */
export function lastValue(v: unknown): unknown {
  return Array.isArray(v) ? v[v.length - 1] : v;
}

export type TextOptions = {
  /** Minimum length after trimming (default 1). */
  min?: number;
  max: number;
  /** Allow line breaks (notes/descriptions). */
  multiline?: boolean;
};

/** Required trimmed text with length bounds and a control-character check. */
export function text(label: string, opts: TextOptions) {
  const min = opts.min ?? 1;
  return z
    .string({ error: `${label} is required` })
    .trim()
    .min(min, { error: min <= 1 ? `${label} is required` : `${label} must be at least ${min} characters` })
    .max(opts.max, { error: `${label} must be at most ${opts.max} characters` })
    .refine((s) => !hasControlChars(s, opts.multiline ?? false), { error: `${label} contains invalid characters` });
}

/** Optional trimmed text: blank → undefined. */
export function optionalText(label: string, opts: TextOptions) {
  return z.preprocess(emptyToUndefined, text(label, { ...opts, min: 1 }).optional());
}

export type NumberOptions = {
  min?: number;
  max?: number;
  /** Strictly greater than 0. */
  positive?: boolean;
  integer?: boolean;
  /** Maximum decimal places (e.g. 3 for quantities, 2 for money/percent). */
  decimals?: number;
  /** Used for a blank value; without it a blank required number is an error. */
  defaultValue?: number;
  /** Override the generic messages. */
  messages?: Partial<Record<"required" | "number" | "min" | "max" | "positive" | "integer" | "decimals", string>>;
};

const PLAIN_NUMBER_RE = /^[+-]?(\d+\.?\d*|\.\d+)$/;

/** Form value → number (or leaves the raw value so zod reports "must be a number"). */
export function numberPreprocess(v: unknown): unknown {
  const raw = lastValue(v);
  if (raw === null || raw === undefined) return undefined;
  if (typeof raw === "number") return raw;
  if (typeof raw === "bigint") return Number(raw);
  if (typeof raw === "string") {
    const s = raw.trim();
    if (s === "") return undefined;
    return PLAIN_NUMBER_RE.test(s) ? Number(s) : s;
  }
  return raw;
}

/** True when `n` has at most `dp` decimal places (tolerates float noise). */
export function hasMaxDecimals(n: number, dp: number): boolean {
  if (!Number.isFinite(n)) return false;
  const scaled = n * 10 ** dp;
  return Math.abs(scaled - Math.round(scaled)) < 1e-6;
}

function buildNumber(label: string, opts: NumberOptions) {
  const m = opts.messages ?? {};
  const requiredMsg = m.required ?? `${label} is required`;
  const numberMsg = m.number ?? `${label} must be a number`;
  let schema = z.number({ error: (issue) => (issue.input === undefined ? requiredMsg : numberMsg) });
  if (opts.integer) schema = schema.int({ error: m.integer ?? `${label} must be a whole number` });
  if (opts.positive) schema = schema.gt(0, { error: m.positive ?? `${label} must be greater than 0` });
  if (opts.min !== undefined) schema = schema.min(opts.min, { error: m.min ?? `${label} must be at least ${opts.min}` });
  if (opts.max !== undefined) schema = schema.max(opts.max, { error: m.max ?? `${label} must be at most ${opts.max}` });
  const dp = opts.decimals;
  if (dp !== undefined) {
    schema = schema.refine((n) => hasMaxDecimals(n, dp), {
      error: m.decimals ?? `${label} can have at most ${dp} decimal place${dp === 1 ? "" : "s"}`,
    });
  }
  return schema;
}

/** Required number field (blank → "X is required" unless `defaultValue` is given). */
export function numberField(label: string, opts: NumberOptions = {}) {
  const inner = buildNumber(label, opts);
  if (opts.defaultValue !== undefined) {
    return z.preprocess(numberPreprocess, inner.default(opts.defaultValue));
  }
  return z.preprocess(numberPreprocess, inner);
}

/** Optional number field (blank → undefined). */
export function optionalNumberField(label: string, opts: NumberOptions = {}) {
  return z.preprocess(numberPreprocess, buildNumber(label, opts).optional());
}

/** Quantity: > 0, ≤ 3 dp. */
export function quantityField(label = "Quantity") {
  return numberField(label, {
    positive: true,
    decimals: 3,
    messages: {
      required: `Enter a ${label.toLowerCase()} greater than 0`,
      number: `Enter a ${label.toLowerCase()} greater than 0`,
      positive: `Enter a ${label.toLowerCase()} greater than 0`,
      decimals: `${label} can have at most 3 decimal places`,
    },
  });
}

/** Integer field with bounds. */
export function intField(label: string, opts: Omit<NumberOptions, "integer" | "decimals"> = {}) {
  return numberField(label, { ...opts, integer: true });
}

const TRUE_VALUES = new Set(["true", "on", "1", "yes", "working"]);
const FALSE_VALUES = new Set(["false", "off", "0", "no", "non-working", "nonworking"]);

export function booleanPreprocess(v: unknown): unknown {
  const raw = lastValue(v);
  if (typeof raw === "boolean") return raw;
  if (raw === null || raw === undefined) return undefined;
  if (typeof raw === "string") {
    const s = raw.trim().toLowerCase();
    if (s === "") return undefined;
    if (TRUE_VALUES.has(s)) return true;
    if (FALSE_VALUES.has(s)) return false;
  }
  return raw;
}

/**
 * Checkbox/switch: absent → false. When a form must be able to send an explicit "false" (edit forms with an Active
 * toggle) render `<input type="hidden" name="x" value="false">` before the control; repeated keys resolve to the last
 * value, so a checked box still yields true.
 */
export function checkbox() {
  return z.preprocess((v) => booleanPreprocess(v) ?? false, z.boolean({ error: "Invalid value" }));
}

/** Checkbox that distinguishes "not on the form" (undefined) from unchecked (false, via a hidden "false" input). */
export function optionalCheckbox() {
  return z.preprocess(booleanPreprocess, z.boolean({ error: "Invalid value" }).optional());
}

/** Required yes/no choice (radio "true"/"false", "working"/"non-working"). */
export function booleanChoice(message = "Choose an option") {
  return z.preprocess(booleanPreprocess, z.boolean({ error: message }));
}

/** Foreign-key id from a Select/Combobox. */
export function idField(entityLabel: string) {
  return z
    .string({ error: `Select a ${entityLabel}` })
    .trim()
    .min(1, { error: `Select a ${entityLabel}` })
    .max(64, { error: `Invalid ${entityLabel}` })
    .refine((s) => !hasControlChars(s), { error: `Invalid ${entityLabel}` });
}

export function optionalIdField(entityLabel: string) {
  return z.preprocess(emptyToUndefined, idField(entityLabel).optional());
}

/** Email: trimmed, lower-cased, RFC-shaped, ≤ 254 chars. */
export const emailField = z
  .string({ error: "Email is required" })
  .trim()
  .toLowerCase()
  .min(1, { error: "Email is required" })
  .pipe(
    z
      .email({ error: "Enter a valid email address" })
      .max(254, { error: "Email must be at most 254 characters" }),
  );

export const optionalEmailField = z.preprocess(emptyToUndefined, emailField.optional());

/** Password policy: 8–72 characters (bcrypt's 72-byte limit). Never trimmed. */
export const passwordField = z
  .string({ error: "Password is required" })
  .min(8, { error: "Password must be at least 8 characters" })
  .max(72, { error: "Password must be at most 72 characters" });

export function passwordEqualsEmail(password: string, email: string): boolean {
  return password.trim().toLowerCase() === email.trim().toLowerCase();
}

/** IANA time zone accepted by Intl (e.g. Asia/Kolkata). */
export const timezoneField = z
  .string({ error: "Select a time zone" })
  .trim()
  .min(1, { error: "Select a time zone" })
  // A blank value is already reported by `.min(1)`; do not stack a second message on it.
  .refine((tz) => tz.length === 0 || isValidTimeZone(tz), { error: "Select a valid time zone" });

/** Calendar date as `YYYY-MM-DD` (rejects impossible dates such as 2026-02-30). */
export function isoDateField(label: string) {
  return z.preprocess(
    (v) => (typeof v === "string" ? v.trim() : v),
    z.iso.date({ error: `${label} must be a valid date (YYYY-MM-DD)` }),
  );
}

export function optionalIsoDateField(label: string) {
  return z.preprocess(
    emptyToUndefined,
    z.iso.date({ error: `${label} must be a valid date (YYYY-MM-DD)` }).optional(),
  );
}

/** ISO 8601 timestamp (with `Z` or an offset) → Date. `DateTimeInput` emits the UTC ISO string. */
export function isoDateTimeField(label: string) {
  return z.preprocess(
    (v) => {
      const raw = lastValue(v);
      if (raw instanceof Date) return Number.isNaN(raw.getTime()) ? raw : raw.toISOString();
      if (typeof raw === "string") return raw.trim();
      return raw;
    },
    z
      .iso.datetime({ offset: true, error: `${label} must be a valid date and time` })
      .transform((s) => new Date(s)),
  );
}

export const HHMM_FIELD_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** `HH:MM` 24-hour time. */
export function hhmmField(label: string) {
  return z
    .string({ error: `${label} is required` })
    .trim()
    .regex(HHMM_FIELD_RE, { error: `${label} must be in HH:MM format` });
}

const UNIT_RE = /^[a-z0-9][a-z0-9 ./%-]*$/;

/** Unit of measure: trimmed + lower-cased, ≤ 16 chars; blank → "pcs" (the schema default). */
export const unitField = z.preprocess(
  (v) => (emptyToUndefined(lastValue(v)) === undefined ? "pcs" : lastValue(v)),
  z
    .string({ error: "Unit is required" })
    .trim()
    .toLowerCase()
    .max(16, { error: "Unit must be at most 16 characters" })
    .regex(UNIT_RE, { error: "Unit may contain letters, digits, spaces and . / % -" }),
);

/** Optional unit (capacity unit): blank → undefined. */
export const optionalUnitField = z.preprocess(
  (v) => emptyToUndefined(lastValue(v)),
  z
    .string()
    .trim()
    .toLowerCase()
    .max(16, { error: "Unit must be at most 16 characters" })
    .regex(UNIT_RE, { error: "Unit may contain letters, digits, spaces and . / % -" })
    .optional(),
);

/** Common units offered by `UnitInput`'s datalist (docs/M1_SPEC.md §4 "Units"). */
export const COMMON_UNITS = ["pcs", "nos", "kg", "g", "m", "mm", "l", "ml", "set", "box"] as const;

/** Normalises a form value for enum matching: trim, upper-case, spaces/hyphens → underscore; blank → undefined. */
export function enumPreprocess(v: unknown): unknown {
  const raw = emptyToUndefined(lastValue(v));
  return typeof raw === "string" ? raw.trim().toUpperCase().replace(/[\s-]+/g, "_") : raw;
}

/** Enum field from a Prisma enum object with a friendly message; blank → error. */
export function enumField<const T extends Record<string, string>>(values: T, message: string) {
  return z.preprocess(enumPreprocess, z.enum(values, { error: message }));
}

/** Enum field where blank falls back to `defaultValue`. */
export function enumFieldWithDefault<const T extends Record<string, string>>(
  values: T,
  message: string,
  defaultValue: T[keyof T],
) {
  return z.preprocess(enumPreprocess, z.enum(values, { error: message }).default(defaultValue));
}

/** Shorthand for `Record<string, string[]>` field errors after `z.flattenError`. */
export type FieldErrors = Record<string, string[]>;

/** Collects issue messages for a flat list ("field: message" when the field is known). */
export function issueMessages(error: z.ZodError, withPath = false): string[] {
  return error.issues.map((i) => (withPath && i.path.length ? `${i.path.join(".")}: ${i.message}` : i.message));
}
