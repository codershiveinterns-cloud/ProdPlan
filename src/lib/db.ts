/**
 * Data-access foundation — docs/M1_SPEC.md §2 (multi-tenancy model), skeleton verified in docs/STACK_NOTES.md §2.4.
 *
 * Two things live here:
 *
 * 1. `prisma` — the RAW, UNSCOPED client. It may be imported ONLY by:
 *      src/lib/db.ts, src/lib/auth/**, src/lib/rate-limit.ts, src/app/api/health/route.ts, prisma/seed.ts, tests/**
 *    (ESLint `no-restricted-imports` + tests/unit/lint-rules.test.ts enforce this). Module code never touches it.
 *
 * 2. `tenantDb(tenantId)` — a Prisma `$extends` client that rewrites EVERY model operation so it can only see and
 *    write rows of one tenant. It is default-deny: any (model, operation) pair that is not handled explicitly throws
 *    `TenantScopeError`. Module code obtains it from `requirePermission()` / `getTenantDb()` and passes the
 *    `tx` client of `db.$transaction(async tx => …)` (type `TenantTx`) to helpers such as `audit()`.
 *
 * The pure helpers `scopeArgs()` and `scopeWriteData()` are exported so the rewriting rules can be unit-tested
 * without a database (tests/unit/tenant-scope.test.ts).
 */
import { PrismaPg } from "@prisma/adapter-pg";
import type { ITXClientDenyList } from "@prisma/client/runtime/client";
import { PrismaClient, Prisma } from "@/generated/prisma/client";

// ---------------------------------------------------------------------------------------------------------------
// Raw client (lazy singleton)
// ---------------------------------------------------------------------------------------------------------------

function connectionString(): string {
  const url = process.env.DATABASE_URL ?? process.env.NETLIFY_DB_URL;
  if (!url) {
    throw new Error(
      "Database connection string is not configured: set DATABASE_URL (local/dev/tests) or NETLIFY_DB_URL (Netlify Database).",
    );
  }
  return url;
}

function createPrisma(): PrismaClient {
  const adapter = new PrismaPg({ connectionString: connectionString() });
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
}

const globalForPrisma = globalThis as unknown as { __prodplanPrisma?: PrismaClient };
let moduleClient: PrismaClient | undefined;

/** Instantiates the client on first use (so importing this module never needs env vars). */
function resolveClient(): PrismaClient {
  if (process.env.NODE_ENV !== "production") {
    // Cached on globalThis so Next's HMR does not open a new pool on every reload.
    globalForPrisma.__prodplanPrisma ??= createPrisma();
    return globalForPrisma.__prodplanPrisma;
  }
  moduleClient ??= createPrisma();
  return moduleClient;
}

/**
 * Raw, unscoped Prisma client. RESTRICTED — see the file header for the allowed importers.
 * Implemented as a lazy proxy: the real client (and the DATABASE_URL check) is created on first property access,
 * not at import time, so unit tests and build steps can load this module without a database.
 */
export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const client = resolveClient();
    const value = Reflect.get(client, prop, client) as unknown;
    return typeof value === "function" ? (value as (...args: unknown[]) => unknown).bind(client) : value;
  },
  has(_target, prop) {
    return prop in resolveClient();
  },
});

// ---------------------------------------------------------------------------------------------------------------
// Tenant scoping rules
// ---------------------------------------------------------------------------------------------------------------

/** Thrown when a query would escape the tenant scope or uses a forbidden shape. Never user-facing. */
export class TenantScopeError extends Error {
  readonly model: string | undefined;
  readonly operation: string | undefined;

  constructor(message: string, model?: string, operation?: string) {
    super(message);
    this.name = "TenantScopeError";
    this.model = model;
    this.operation = operation;
  }
}

/** Every model that carries a tenantId column. tests/unit/tenant-scope-coverage.test.ts keeps this in sync with schema.prisma. */
export const TENANT_SCOPED_MODELS: ReadonlySet<Prisma.ModelName> = new Set<Prisma.ModelName>([
  Prisma.ModelName.User,
  Prisma.ModelName.Customer,
  Prisma.ModelName.Product,
  Prisma.ModelName.ProductOperation,
  Prisma.ModelName.Material,
  Prisma.ModelName.BomItem,
  Prisma.ModelName.StockMovement,
  Prisma.ModelName.WorkCenter,
  Prisma.ModelName.ShiftCalendar,
  Prisma.ModelName.Shift,
  Prisma.ModelName.CalendarException,
  Prisma.ModelName.Machine,
  Prisma.ModelName.DowntimeWindow,
  Prisma.ModelName.Order,
  Prisma.ModelName.ImportBatch,
  Prisma.ModelName.AuditLog,
  "ScheduleRun",
  "ScheduleEntry",
  "ScheduleConflict",
  "Notification",
]);

/** Models WITHOUT a tenantId column. `Tenant` is handled by name below; anything else is denied through tenantDb(). */
export const PLATFORM_MODELS: ReadonlySet<Prisma.ModelName> = new Set<Prisma.ModelName>([
  Prisma.ModelName.Tenant,
  Prisma.ModelName.RateLimitBucket,
]);

/**
 * Json columns. The write-data walker must not descend into their values (a JSON payload may legitimately contain
 * keys such as `set` or `create`). No relation field shares one of these names (asserted by the coverage test).
 */
export const JSON_FIELDS: Readonly<Record<string, readonly string[]>> = {
  ImportBatch: ["rows"],
  AuditLog: ["before", "after"],
  ScheduleRun: ["summary"],
  ScheduleConflict: ["details"],
};
const JSON_FIELD_NAMES: ReadonlySet<string> = new Set(Object.values(JSON_FIELDS).flat());

/** ImportBatch is append-only except for these columns (spec §2.5). */
export const IMPORT_BATCH_UPDATABLE_FIELDS: ReadonlySet<string> = new Set([
  "status",
  "rows",
  "rowCount",
  "validCount",
  "errorCount",
  "importedCount",
]);

/** List / aggregate operations: caller `where` is AND-wrapped with `{ tenantId }`. */
const WHERE_OPS: ReadonlySet<string> = new Set([
  "findMany",
  "findFirst",
  "findFirstOrThrow",
  "count",
  "aggregate",
  "groupBy",
  "updateMany",
  "updateManyAndReturn",
  "deleteMany",
]);
/** Unique operations: `{ ...where, tenantId }` (scope written last so it wins). */
const UNIQUE_OPS: ReadonlySet<string> = new Set(["findUnique", "findUniqueOrThrow", "update", "delete", "upsert"]);
/** Create operations: data walker forces tenantId. */
const CREATE_OPS: ReadonlySet<string> = new Set(["create", "createMany", "createManyAndReturn"]);

const UPDATE_LIKE_OPS: ReadonlySet<string> = new Set(["update", "updateMany", "updateManyAndReturn", "upsert"]);
const DELETE_LIKE_OPS: ReadonlySet<string> = new Set(["delete", "deleteMany"]);

/** Append-only models: no update*, delete*, upsert. */
const APPEND_ONLY_MODELS: ReadonlySet<string> = new Set([Prisma.ModelName.AuditLog, Prisma.ModelName.StockMovement]);
/** Models that are never hard-deleted through the scoped client (deactivate instead). */
const NO_DELETE_MODELS: ReadonlySet<string> = new Set([Prisma.ModelName.User]);

/** Relation write verbs that are never allowed — relations are written only via scalar FK fields. */
const FORBIDDEN_RELATION_KEYS: ReadonlySet<string> = new Set(["connect", "connectOrCreate", "set", "disconnect"]);
/** Relation fields that point at Tenant; writing through them could create/re-parent tenants. */
const TENANT_RELATION_KEYS: readonly string[] = ["tenant", "defaultForTenants"];

export type WriteMode = "create" | "update";

type AnyRecord = Record<string, unknown>;

function isPlainObject(value: unknown): value is AnyRecord {
  if (value === null || typeof value !== "object") return false;
  const proto: unknown = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function mapItems(value: unknown, fn: (item: unknown) => unknown): unknown {
  return Array.isArray(value) ? value.map(fn) : fn(value);
}

/**
 * Walks a `data` payload (create / update shape, single object or array of objects).
 *  - create shapes: sets top-level `tenantId` to the scope value (overwriting any caller value);
 *  - update shapes: DELETES `tenantId` (a row can never move between tenants);
 *  - throws if `tenant` / `defaultForTenants` (relation fields pointing at Tenant) are present;
 *  - throws on `connect`, `connectOrCreate`, `set`, `disconnect` at any depth;
 *  - nested `create` / `createMany` objects: `tenantId` is overwritten with the scope value whenever the caller
 *    passed the key. When it is absent it stays absent: children reached through a composite FK (product →
 *    bomItems, calendar → shifts, machine → downtime, …) inherit tenantId from the already-scoped parent row and
 *    Prisma rejects an explicit value there ("Unknown argument tenantId" — verified against Prisma 7.10);
 *  - nested `update` / `updateMany` / `upsert` data is walked recursively in the matching mode;
 *  - Json column values (`rows`, `before`, `after`) are left untouched.
 * Never mutates its input.
 */
export function scopeWriteData(data: unknown, mode: WriteMode, tenantId: string, path = "data"): unknown {
  return walkWriteData(data, mode, tenantId, path, false);
}

function walkWriteData(data: unknown, mode: WriteMode, tenantId: string, path: string, nested: boolean): unknown {
  if (Array.isArray(data)) {
    return data.map((row, index) => walkWriteData(row, mode, tenantId, `${path}[${index}]`, nested));
  }
  if (!isPlainObject(data)) return data;

  const out: AnyRecord = { ...data };
  for (const relation of TENANT_RELATION_KEYS) {
    if (relation in out) {
      throw new TenantScopeError(`${path}.${relation}: the tenant is set by tenantDb(); pass scalar FK fields only`);
    }
  }
  if (mode === "create") {
    if (!nested || "tenantId" in out) out.tenantId = tenantId;
  } else {
    delete out.tenantId;
  }

  for (const [key, value] of Object.entries(out)) {
    if (key === "tenantId" || JSON_FIELD_NAMES.has(key)) continue;
    if (!isPlainObject(value)) continue; // scalars, Dates, Decimals, scalar lists, enums
    out[key] = scopeNestedField(value, tenantId, `${path}.${key}`);
  }
  return out;
}

/** Handles the object under a field key: either a relation-write envelope or a scalar atomic operation. */
function scopeNestedField(field: AnyRecord, tenantId: string, path: string): AnyRecord {
  const out: AnyRecord = { ...field };
  const create = (value: unknown, sub: string) => walkWriteData(value, "create", tenantId, `${path}.${sub}`, true);
  const update = (value: unknown, sub: string) => walkWriteData(value, "update", tenantId, `${path}.${sub}`, true);

  for (const [verb, arg] of Object.entries(out)) {
    if (FORBIDDEN_RELATION_KEYS.has(verb)) {
      throw new TenantScopeError(`${path}.${verb} is not allowed; write relations via scalar FK fields`);
    }
    switch (verb) {
      case "create":
        out.create = create(arg, "create");
        break;
      case "createMany":
        if (isPlainObject(arg)) out.createMany = { ...arg, data: create(arg.data, "createMany.data") };
        break;
      case "update":
        out.update = mapItems(arg, (item) =>
          isPlainObject(item) && "data" in item
            ? { ...item, data: update(item.data, "update.data") }
            : update(item, "update"),
        );
        break;
      case "updateMany":
        out.updateMany = mapItems(arg, (item) =>
          isPlainObject(item) && "data" in item ? { ...item, data: update(item.data, "updateMany.data") } : item,
        );
        break;
      case "upsert":
        out.upsert = mapItems(arg, (item) =>
          isPlainObject(item)
            ? { ...item, create: create(item.create, "upsert.create"), update: update(item.update, "upsert.update") }
            : item,
        );
        break;
      default:
        // `delete` / `deleteMany` (booleans or filters) and scalar atomic ops ({ increment }, { push }, …) pass through.
        break;
    }
  }
  return out;
}

/** ScheduleConflict rows are append-only except for `resolvedAt` (docs/M2_SPEC.md §1). */
const SCHEDULE_CONFLICT_UPDATABLE_FIELDS: ReadonlySet<string> = new Set(["resolvedAt"]);

function assertScheduleConflictUpdate(data: unknown, operation: string): void {
  const rows = Array.isArray(data) ? data : [data];
  for (const row of rows) {
    if (!isPlainObject(row)) continue;
    const illegal = Object.keys(row).filter((k) => !SCHEDULE_CONFLICT_UPDATABLE_FIELDS.has(k));
    if (illegal.length > 0) {
      throw new TenantScopeError(
        `ScheduleConflict.${operation}: only resolvedAt may be updated (got ${illegal.join(", ")})`,
        Prisma.ModelName.ScheduleConflict,
        operation,
      );
    }
  }
}

function assertImportBatchUpdate(data: unknown, operation: string): void {
  const rows = Array.isArray(data) ? data : [data];
  for (const row of rows) {
    if (!isPlainObject(row)) continue;
    const illegal = Object.keys(row).filter((k) => !IMPORT_BATCH_UPDATABLE_FIELDS.has(k));
    if (illegal.length > 0) {
      throw new TenantScopeError(
        `ImportBatch.${operation}: only status/counts/rows may be updated (got ${illegal.join(", ")})`,
        Prisma.ModelName.ImportBatch,
        operation,
      );
    }
  }
}

/**
 * The Tenant model has no tenantId column, so it is handled by name: reads and updates are forced onto the row
 * `id = tenantId`. The caller's own `where` is kept as an extra filter, so asking for another tenant's id yields
 * null / P2025 instead of silently returning the scoped tenant. `id` and `slug` can never be changed.
 */
function scopeTenantArgs(operation: string, args: AnyRecord, tenantId: string): AnyRecord {
  const callerWhere: AnyRecord = isPlainObject(args.where) ? args.where : {};
  switch (operation) {
    case "findUnique":
    case "findUniqueOrThrow":
      args.where = { id: tenantId, AND: [callerWhere] };
      return args;
    case "findFirst":
    case "findFirstOrThrow":
    case "findMany":
    case "count":
      args.where = { AND: [callerWhere, { id: tenantId }] };
      return args;
    case "update":
    case "updateMany":
    case "updateManyAndReturn": {
      args.where =
        operation === "update" ? { id: tenantId, AND: [callerWhere] } : { AND: [callerWhere, { id: tenantId }] };
      const data = scopeWriteData(args.data, "update", tenantId);
      if (isPlainObject(data)) {
        delete data.id;
        delete data.slug;
      }
      args.data = data;
      return args;
    }
    default:
      throw new TenantScopeError(
        `Tenant.${operation} is not allowed through tenantDb()`,
        Prisma.ModelName.Tenant,
        operation,
      );
  }
}

/**
 * Rewrites the args of one model operation so it is confined to `tenantId`. Pure; throws TenantScopeError on any
 * (model, operation) pair that is not explicitly allowed (default-deny). Returns a new args object.
 */
export function scopeArgs(model: string, operation: string, rawArgs: unknown, tenantId: string): AnyRecord {
  if (!tenantId) throw new TenantScopeError("tenantId is required", model, operation);
  const args: AnyRecord = isPlainObject(rawArgs) ? { ...rawArgs } : {};

  if (model === Prisma.ModelName.Tenant) return scopeTenantArgs(operation, args, tenantId);

  if (!TENANT_SCOPED_MODELS.has(model as Prisma.ModelName)) {
    throw new TenantScopeError(`${model}.${operation} is not tenant-scoped and cannot be used through tenantDb()`, model, operation);
  }

  if (APPEND_ONLY_MODELS.has(model) && (UPDATE_LIKE_OPS.has(operation) || DELETE_LIKE_OPS.has(operation))) {
    throw new TenantScopeError(`${model} is append-only: ${operation} is not allowed`, model, operation);
  }
  if (NO_DELETE_MODELS.has(model) && DELETE_LIKE_OPS.has(operation)) {
    throw new TenantScopeError(`${model}.${operation} is not allowed: deactivate instead of deleting`, model, operation);
  }

  if (WHERE_OPS.has(operation)) {
    args.where = { AND: [args.where ?? {}, { tenantId }] };
  } else if (UNIQUE_OPS.has(operation)) {
    args.where = { ...(isPlainObject(args.where) ? args.where : {}), tenantId };
  } else if (!CREATE_OPS.has(operation)) {
    throw new TenantScopeError(`${model}.${operation} is not supported through tenantDb()`, model, operation);
  }

  switch (operation) {
    case "create":
    case "createMany":
    case "createManyAndReturn":
      args.data = scopeWriteData(args.data, "create", tenantId);
      break;
    case "update":
    case "updateMany":
    case "updateManyAndReturn":
      args.data = scopeWriteData(args.data, "update", tenantId);
      if (model === Prisma.ModelName.ImportBatch) assertImportBatchUpdate(args.data, operation);
      if (model === Prisma.ModelName.ScheduleConflict) assertScheduleConflictUpdate(args.data, operation);
      break;
    case "upsert":
      args.create = scopeWriteData(args.create, "create", tenantId, "create");
      args.update = scopeWriteData(args.update, "update", tenantId, "update");
      if (model === Prisma.ModelName.ImportBatch) assertImportBatchUpdate(args.update, operation);
      if (model === Prisma.ModelName.ScheduleConflict) assertScheduleConflictUpdate(args.update, operation);
      break;
    default:
      break;
  }
  return args;
}

// ---------------------------------------------------------------------------------------------------------------
// Scoped client
// ---------------------------------------------------------------------------------------------------------------

function rawForbidden(): never {
  throw new TenantScopeError(
    "Raw SQL is not available on the tenant-scoped client (it cannot be tenant-filtered). Use model operations.",
  );
}

/**
 * Returns a Prisma client confined to one tenant. Every model operation is rewritten by `scopeArgs()`; raw SQL
 * helpers throw; `$transaction(async tx => …)` yields a `tx` that stays scoped. `db.$tenantId` exposes the scope.
 */
export function tenantDb(tenantId: string) {
  if (!tenantId) throw new TenantScopeError("tenantDb: tenantId is required");
  return prisma.$extends({
    name: `tenant:${tenantId}`,
    client: {
      /** The tenant this client is confined to. */
      $tenantId: tenantId,
      $queryRaw: rawForbidden,
      $queryRawUnsafe: rawForbidden,
      $queryRawTyped: rawForbidden,
      $executeRaw: rawForbidden,
      $executeRawUnsafe: rawForbidden,
    },
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          const scoped = scopeArgs(model, operation, args, tenantId);
          // query()'s parameter is the operation-specific args type; we rebuilt it as a plain record.
          return query(scoped as never);
        },
      },
    },
  });
}

export type TenantDb = ReturnType<typeof tenantDb>;
/** The client handed to the callback of `db.$transaction(async tx => …)` — still tenant-scoped. */
export type TenantTx = Omit<TenantDb, ITXClientDenyList>;
