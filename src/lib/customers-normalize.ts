/**
 * Customer name normalisation (docs/M1_SPEC.md §4 "Customers"): trimmed, internal whitespace collapsed to one space.
 * Lookups compare case-insensitively (`mode: "insensitive"`); the typed casing is kept when creating.
 */
export function normalizeCustomerName(s: string): string {
  return String(s ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Case-insensitive lookup key for in-memory maps/sets (import de-duplication, "new customers" chip). */
export function customerNameKey(s: string): string {
  return normalizeCustomerName(s).toLowerCase();
}
