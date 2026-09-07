/**
 * Server Action plumbing shared by every module (docs/M1_SPEC.md §3, §5 "Forms").
 *
 *   const createThing = withAction(async (formData) => {
 *     const { session, db } = await requirePermission("things:write");
 *     const input = parseForm(thingSchema, formData);   // throws ZodError → fieldErrors
 *     ...
 *     redirect(`/things/${row.id}`);                     // NEXT_REDIRECT is rethrown, never swallowed
 *   });
 *
 * `withAction` maps ZodError → fieldErrors, ForbiddenError → "forbidden", DomainError/AppError → its message,
 * Prisma P2002 → "already exists", anything else → a generic message (logged server-side).
 */
import { unstable_rethrow } from "next/navigation";
import { z } from "zod";
import { AppError, ForbiddenError } from "@/lib/errors";
import { logger } from "@/lib/logger";

export type ActionState<T = unknown> =
  | null
  | { ok: true; message?: string; data?: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

/** The signature `useActionState` expects. */
export type ServerAction<T = unknown> = (prev: ActionState<T>, formData: FormData) => Promise<ActionState<T>>;

export const GENERIC_ERROR_MESSAGE = "Something went wrong. Please try again.";
export const VALIDATION_ERROR_MESSAGE = "Please fix the highlighted fields.";

export function ok<T>(data?: T, message?: string): ActionState<T> {
  return { ok: true, ...(message !== undefined ? { message } : {}), ...(data !== undefined ? { data } : {}) };
}

export function fail<T = unknown>(error: string, fieldErrors?: Record<string, string[]>): ActionState<T> {
  return fieldErrors ? { ok: false, error, fieldErrors } : { ok: false, error };
}

/** A single-field error, e.g. `fieldError("email", "An account with this email already exists")`. */
export function fieldError<T = unknown>(field: string, message: string, summary = message): ActionState<T> {
  return { ok: false, error: summary, fieldErrors: { [field]: [message] } };
}

type PrismaLikeError = {
  code: string;
  meta?: {
    target?: unknown;
    modelName?: unknown;
    driverAdapterError?: { cause?: { constraint?: { index?: unknown; fields?: unknown }; table?: unknown } };
  };
};

/** Duck-typed check for `PrismaClientKnownRequestError` (no Prisma import so client bundles never pull it in). */
export function isPrismaKnownError(err: unknown): err is PrismaLikeError {
  return (
    typeof err === "object" &&
    err !== null &&
    typeof (err as { code?: unknown }).code === "string" &&
    /^P\d{4}$/.test((err as { code: string }).code)
  );
}

function humanizeField(field: string): string {
  return field
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .toLowerCase();
}

function stringList(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === "string");
  if (typeof value === "string") return value.split(",").map((s) => s.trim()).filter(Boolean);
  return [];
}

/**
 * Field names behind a P2002 unique violation. Handles both Prisma meta shapes: `meta.target` (query engine) and
 * `meta.driverAdapterError.cause.constraint` (driver adapters such as @prisma/adapter-pg, where only the index name
 * `Table_field1_field2_key` is reported). `tenantId` is dropped — it is never the field the user got wrong.
 */
export function uniqueViolationFields(err: unknown): string[] {
  if (!isPrismaKnownError(err) || err.code !== "P2002") return [];
  const meta = err.meta;
  let fields = stringList(meta?.target);
  if (fields.length === 0) {
    const constraint = meta?.driverAdapterError?.cause?.constraint;
    fields = stringList(constraint?.fields);
    if (fields.length === 0 && typeof constraint?.index === "string") {
      const table =
        typeof meta?.driverAdapterError?.cause?.table === "string"
          ? meta.driverAdapterError.cause.table
          : typeof meta?.modelName === "string"
            ? meta.modelName
            : null;
      let index = constraint.index.replace(/_(key|idx|pkey)$/, "");
      if (table && index.startsWith(`${table}_`)) index = index.slice(table.length + 1);
      fields = index.split("_").filter(Boolean);
    }
  }
  return fields.filter((f) => f !== "tenantId");
}

function logActionError(err: unknown): void {
  // Server-side diagnostics only; the user gets GENERIC_ERROR_MESSAGE.
  logger.error("Unhandled error in server action", err);
}

/**
 * Converts a thrown error into an `ActionState`. Next.js control-flow errors (redirect/notFound/forbidden) are
 * rethrown so the framework can handle them.
 */
export function mapActionError<T = unknown>(err: unknown): ActionState<T> {
  unstable_rethrow(err);

  if (err instanceof z.ZodError) {
    const { formErrors, fieldErrors } = z.flattenError(err);
    const error = formErrors[0] ?? VALIDATION_ERROR_MESSAGE;
    return { ok: false, error, fieldErrors: fieldErrors as Record<string, string[]> };
  }
  if (err instanceof ForbiddenError) {
    return { ok: false, error: "forbidden" };
  }
  if (err instanceof AppError) {
    return { ok: false, error: err.message };
  }
  if (isPrismaKnownError(err)) {
    if (err.code === "P2002") {
      const fields = uniqueViolationFields(err);
      const label = fields.length ? `A record with the same ${fields.map(humanizeField).join(" and ")} already exists.` : "This record already exists.";
      return fields.length
        ? { ok: false, error: label, fieldErrors: Object.fromEntries(fields.map((f) => [f, ["Already exists"]])) }
        : { ok: false, error: label };
    }
    if (err.code === "P2003") {
      return { ok: false, error: "This record is referenced by other data and cannot be changed." };
    }
    if (err.code === "P2025") {
      return { ok: false, error: "This record no longer exists. Refresh the page and try again." };
    }
  }
  logActionError(err);
  return { ok: false, error: GENERIC_ERROR_MESSAGE };
}

export function withAction<T = unknown>(fn: (formData: FormData) => Promise<ActionState<T>>): ServerAction<T> {
  return async (_prev: ActionState<T>, formData: FormData): Promise<ActionState<T>> => {
    try {
      return await fn(formData);
    } catch (err) {
      return mapActionError<T>(err);
    }
  };
}

// ---------------------------------------------------------------------------------------------------------------
// parseForm
// ---------------------------------------------------------------------------------------------------------------

type ZodDef = {
  type?: string;
  innerType?: unknown;
  in?: unknown;
  shape?: Record<string, unknown>;
};

function defOf(schema: unknown): ZodDef | undefined {
  if (typeof schema !== "object" || schema === null) return undefined;
  const internals = (schema as { _zod?: { def?: ZodDef } })._zod;
  return internals?.def;
}

const WRAPPERS = new Set(["optional", "nullable", "nonoptional", "default", "prefault", "catch", "readonly"]);

/** Follows optional/default/nullable/pipe wrappers down to the schema that describes the value's shape. */
function unwrap(schema: unknown): unknown {
  let current = schema;
  for (let i = 0; i < 16; i++) {
    const def = defOf(current);
    if (!def?.type) return current;
    if (WRAPPERS.has(def.type) && def.innerType) {
      current = def.innerType;
      continue;
    }
    if (def.type === "pipe" && def.in) {
      current = def.in;
      continue;
    }
    return current;
  }
  return current;
}

function shapeOf(schema: unknown): Record<string, unknown> | null {
  const base = unwrap(schema);
  const def = defOf(base);
  if (def?.type === "object") {
    const shape = (base as { shape?: Record<string, unknown> }).shape ?? def.shape;
    return shape ?? null;
  }
  return null;
}

function acceptsUndefined(schema: unknown): boolean {
  const s = schema as { safeParse?: (v: unknown) => { success: boolean } };
  if (typeof s.safeParse !== "function") return false;
  try {
    return s.safeParse(undefined).success;
  } catch {
    return false;
  }
}

/** Types for which an empty string is meaningful input that the schema should judge itself (e.g. `.min(1)`). */
const STRINGISH = new Set(["string", "enum", "literal", "template_literal"]);

type FormValue = string | File;

/** Raw FormData → plain object: repeated keys become arrays; Next's internal `$ACTION*` keys are dropped. */
export function formDataToObject(formData: FormData): Record<string, FormValue | FormValue[]> {
  const out: Record<string, FormValue | FormValue[]> = {};
  for (const [key, value] of formData.entries()) {
    if (key.startsWith("$ACTION")) continue;
    const existing = out[key];
    if (existing === undefined) out[key] = value;
    else if (Array.isArray(existing)) existing.push(value);
    else out[key] = [existing, value];
  }
  return out;
}

/**
 * Parses a FormData against a zod schema. Throws `ZodError` (mapped to `fieldErrors` by `withAction`).
 *
 * - repeated keys → arrays; a single value for an array field is wrapped; a missing required array becomes `[]`;
 * - `""` → `undefined` for every field that accepts `undefined` (optional/default) and for non-string fields
 *   (`z.coerce.number()`, dates …) so an empty input never silently becomes `0`/`false`;
 * - `""` is kept for required string fields so `.min(1, "Required")` messages apply;
 * - checkbox `"on"` → `true` when the schema uses `z.coerce.boolean()`; a missing checkbox → `undefined` → `false`.
 */
export function parseForm<S extends z.ZodType>(schema: S, formData: FormData): z.output<S> {
  const raw = formDataToObject(formData);
  const shape = shapeOf(schema);
  const input: Record<string, unknown> = { ...raw };

  if (shape) {
    for (const [key, fieldSchema] of Object.entries(shape)) {
      const value = input[key];
      const optional = acceptsUndefined(fieldSchema);
      const base = unwrap(fieldSchema);
      const baseType = defOf(base)?.type;

      if (baseType === "array") {
        if (value === undefined) {
          input[key] = optional ? undefined : [];
        } else if (!Array.isArray(value)) {
          input[key] = value === "" ? (optional ? undefined : []) : [value];
        }
        continue;
      }

      if (value === undefined) {
        // zod 4 treats a MISSING key as "nonoptional" even when the schema accepts undefined (z.coerce.boolean(),
        // .default()), so the key is set explicitly. A missing required string gets "" so `.min(1)` messages apply.
        input[key] = !optional && STRINGISH.has(baseType ?? "") ? "" : undefined;
        continue;
      }

      if (value === "") {
        if (optional || !STRINGISH.has(baseType ?? "")) input[key] = undefined;
      }
    }
  } else {
    for (const [key, value] of Object.entries(input)) {
      if (value === "") input[key] = undefined;
    }
  }

  return schema.parse(input) as z.output<S>;
}
