/**
 * `toPlain()` turns Prisma rows into JSON-safe plain data for Client Components and audit snapshots
 * (docs/M1_SPEC.md §4): Decimal → number, Date → ISO string, arrays/objects recursively, and the sensitive user
 * columns `passwordHash` / `tokenVersion` are dropped at ANY depth (spec §3). Pure; safe to import anywhere.
 */
import type { Prisma } from "@/generated/prisma/client";

type SensitiveKey = "passwordHash" | "tokenVersion";

/** Type-level mirror of what toPlain() does at runtime. */
export type Plain<T> = T extends Prisma.Decimal
  ? number
  : T extends Date
    ? string
    : T extends (infer U)[]
      ? Plain<U>[]
      : T extends (...args: never[]) => unknown
        ? never
        : T extends object
          ? { [K in keyof T as K extends SensitiveKey ? never : K]: Plain<T[K]> }
          : T;

const SENSITIVE_KEYS: ReadonlySet<string> = new Set<SensitiveKey>(["passwordHash", "tokenVersion"]);

/** Duck-typed check for decimal.js instances (avoids importing the Prisma runtime into client bundles). */
function isDecimalLike(value: object): boolean {
  const v = value as { d?: unknown; e?: unknown; s?: unknown; toFixed?: unknown };
  return Array.isArray(v.d) && typeof v.e === "number" && typeof v.s === "number" && typeof v.toFixed === "function";
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object") return false;
  const proto: unknown = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function walk(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === "bigint") return Number(value);
  if (typeof value !== "object") return value;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString();
  if (isDecimalLike(value)) return Number(String(value));
  if (Array.isArray(value)) return value.map(walk);
  if (!isPlainObject(value)) return value; // Buffers, Maps, class instances: left as-is
  const out: Record<string, unknown> = {};
  for (const [key, inner] of Object.entries(value)) {
    if (SENSITIVE_KEYS.has(key)) continue;
    out[key] = walk(inner);
  }
  return out;
}

/** Converts Prisma results (Decimal, Date, nested rows) into plain JSON-safe values and strips sensitive keys. */
export function toPlain<T>(value: T): Plain<T> {
  return walk(value) as Plain<T>;
}
