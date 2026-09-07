/**
 * Order-number rules (docs/M1_SPEC.md §4 "Orders").
 *
 * Automatic numbers are `SO-%06d` from `Tenant.orderSeq`. User-provided numbers are trimmed, upper-cased, must match
 * `^[A-Z0-9._/-]{3,32}$` and may NOT look like an automatic number (`^SO-\d{6}$`).
 */
import { z } from "zod";

export const ORDER_NUMBER_PREFIX = "SO-";
export const ORDER_NUMBER_RE = /^[A-Z0-9._/-]{3,32}$/;
export const RESERVED_ORDER_NUMBER_RE = /^SO-\d{6}$/;

export const ORDER_NUMBER_FORMAT_MESSAGE =
  "Order number must be 3–32 characters using letters, digits and . _ / -";
export const ORDER_NUMBER_RESERVED_MESSAGE =
  "Numbers like SO-000123 are reserved for automatic numbering — choose a different order number";

/** `123` → `SO-000123` (sequences above 999,999 simply use more digits). */
export function formatOrderNumber(seq: number): string {
  if (!Number.isInteger(seq) || seq < 0) throw new RangeError(`Invalid order sequence: ${String(seq)}`);
  return `${ORDER_NUMBER_PREFIX}${String(seq).padStart(6, "0")}`;
}

/** Trim + upper-case (the stored form). */
export function normalizeOrderNumber(s: string): string {
  return String(s ?? "")
    .trim()
    .toUpperCase();
}

/** True when the (normalised) value collides with the automatic `SO-000123` pattern. */
export function isReservedOrderNumber(s: string): boolean {
  return RESERVED_ORDER_NUMBER_RE.test(normalizeOrderNumber(s));
}

/** True when the (normalised) value is a legal user-provided order number. */
export function isValidOrderNumber(s: string): boolean {
  const n = normalizeOrderNumber(s);
  return ORDER_NUMBER_RE.test(n) && !RESERVED_ORDER_NUMBER_RE.test(n);
}

/** Zod schema: normalises then validates a user-provided order number. */
export const orderNumberSchema = z
  .string({ error: "Enter an order number" })
  .transform((s) => normalizeOrderNumber(s))
  .pipe(
    z
      .string()
      .regex(ORDER_NUMBER_RE, { error: ORDER_NUMBER_FORMAT_MESSAGE })
      .refine((s) => !RESERVED_ORDER_NUMBER_RE.test(s), { error: ORDER_NUMBER_RESERVED_MESSAGE }),
  );

/** Same as `orderNumberSchema` but blank/whitespace means "auto-number" (undefined). */
export const optionalOrderNumberSchema = z.preprocess(
  (v) => (v === null || v === undefined || (typeof v === "string" && v.trim() === "") ? undefined : v),
  orderNumberSchema.optional(),
);

/** Numbers reserved by `reserveOrderNumbers` (tenant.orderSeq incremented by N → last value `end`). */
export function reservedOrderNumbers(endSeq: number, count: number): string[] {
  if (!Number.isInteger(endSeq) || !Number.isInteger(count) || count < 0 || endSeq - count < 0) {
    throw new RangeError("reservedOrderNumbers: invalid range");
  }
  const out: string[] = [];
  for (let seq = endSeq - count + 1; seq <= endSeq; seq++) out.push(formatOrderNumber(seq));
  return out;
}
