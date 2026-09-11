/**
 * Unit tests for the tenant-scoping rules in src/lib/db.ts (docs/M1_SPEC.md §2). Pure — no database.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { scopeArgs, scopeWriteData, tenantDb, TenantScopeError, TENANT_SCOPED_MODELS } from "@/lib/db";

const A = "tenant_a";
const B = "tenant_b";

const LIST_OPS = [
  "findMany",
  "findFirst",
  "findFirstOrThrow",
  "count",
  "aggregate",
  "groupBy",
  "updateMany",
  "updateManyAndReturn",
  "deleteMany",
];
const UNIQUE_OPS = ["findUnique", "findUniqueOrThrow", "update", "delete", "upsert"];

describe("scopeArgs — where rewriting", () => {
  it("AND-wraps the caller where for list/aggregate ops", () => {
    for (const op of LIST_OPS) {
      const out = scopeArgs("Product", op, { where: { sku: "X" }, data: { name: "n" } }, A);
      expect(out.where, op).toEqual({ AND: [{ sku: "X" }, { tenantId: A }] });
    }
  });

  it("AND-wraps even when no where is given", () => {
    expect(scopeArgs("Order", "findMany", undefined, A).where).toEqual({ AND: [{}, { tenantId: A }] });
    expect(scopeArgs("Order", "count", {}, A).where).toEqual({ AND: [{}, { tenantId: A }] });
  });

  it("a caller-supplied tenantId inside a list where cannot widen the scope", () => {
    const out = scopeArgs("Order", "findMany", { where: { tenantId: B } }, A);
    expect(out.where).toEqual({ AND: [{ tenantId: B }, { tenantId: A }] });
  });

  it("spreads tenantId last for unique ops so the scope wins", () => {
    for (const op of UNIQUE_OPS) {
      const out = scopeArgs(
        "Order",
        op,
        { where: { id: "o1", tenantId: B }, data: {}, create: { orderNumber: "SO-1" }, update: {} },
        A,
      );
      expect(out.where, op).toEqual({ id: "o1", tenantId: A });
    }
  });

  it("keeps the rest of the args (select/include/orderBy/take) intact and does not mutate the input", () => {
    const input = { where: { sku: "X" }, select: { id: true }, orderBy: { sku: "asc" }, take: 5 };
    const snapshot = JSON.parse(JSON.stringify(input));
    const out = scopeArgs("Product", "findMany", input, A);
    expect(out.select).toEqual({ id: true });
    expect(out.orderBy).toEqual({ sku: "asc" });
    expect(out.take).toBe(5);
    expect(input).toEqual(snapshot);
  });
});

describe("scopeArgs — write data", () => {
  it("create: forces tenantId to the scope value (overwriting the caller's)", () => {
    const out = scopeArgs("Customer", "create", { data: { tenantId: B, name: "Acme" } }, A);
    expect(out.data).toEqual({ tenantId: A, name: "Acme" });
    const missing = scopeArgs("Customer", "create", { data: { name: "Acme" } }, A);
    expect(missing.data).toEqual({ tenantId: A, name: "Acme" });
  });

  it("createMany / createManyAndReturn: every row gets the scope tenantId", () => {
    for (const op of ["createMany", "createManyAndReturn"]) {
      const out = scopeArgs("WorkCenter", op, { data: [{ tenantId: B, code: "A" }, { code: "B" }] }, A);
      expect(out.data, op).toEqual([
        { tenantId: A, code: "A" },
        { tenantId: A, code: "B" },
      ]);
      const single = scopeArgs("WorkCenter", op, { data: { code: "C", tenantId: "junk" } }, A);
      expect(single.data, op).toEqual({ tenantId: A, code: "C" });
    }
  });

  it("update / updateMany / updateManyAndReturn: tenantId is stripped from data", () => {
    for (const op of ["update", "updateMany", "updateManyAndReturn"]) {
      const out = scopeArgs("Product", op, { where: { id: "p1" }, data: { tenantId: B, name: "n" } }, A);
      expect(out.data, op).toEqual({ name: "n" });
    }
  });

  it("upsert: create gets tenantId, update loses it, where is scoped", () => {
    const out = scopeArgs(
      "Material",
      "upsert",
      {
        where: { tenantId_code: { tenantId: A, code: "RM-1" } },
        create: { tenantId: B, code: "RM-1", name: "Steel" },
        update: { tenantId: B, name: "Steel" },
      },
      A,
    );
    expect(out.where).toEqual({ tenantId_code: { tenantId: A, code: "RM-1" }, tenantId: A });
    expect(out.create).toEqual({ tenantId: A, code: "RM-1", name: "Steel" });
    expect(out.update).toEqual({ name: "Steel" });
  });

  it("throws when the tenant relation is written directly", () => {
    expect(() => scopeArgs("Product", "create", { data: { tenant: { connect: { id: B } }, sku: "x" } }, A)).toThrow(
      TenantScopeError,
    );
    expect(() => scopeArgs("Product", "update", { where: { id: "p" }, data: { tenant: { connect: { id: B } } } }, A)).toThrow(
      TenantScopeError,
    );
    expect(() =>
      scopeArgs("ShiftCalendar", "update", { where: { id: "c" }, data: { defaultForTenants: { create: { name: "x", slug: "y" } } } }, A),
    ).toThrow(TenantScopeError);
  });
});

describe("scopeWriteData — nested relation writes", () => {
  it("throws on connect / connectOrCreate / set / disconnect at any depth", () => {
    const cases: unknown[] = [
      { product: { connect: { id: "p" } } },
      { product: { connectOrCreate: { where: { id: "p" }, create: {} } } },
      { bomItems: { set: [] } },
      { machine: { disconnect: true } },
      { bomItems: { create: { material: { connect: { id: "m" } } } } },
      { bomItems: { create: [{ quantityPerUnit: 1 }, { material: { connectOrCreate: {} } }] } },
      { bomItems: { update: { where: { id: "b" }, data: { material: { connect: { id: "m" } } } } } },
      { bomItems: { upsert: { where: { id: "b" }, create: {}, update: { material: { disconnect: true } } } } },
      { name: { set: "explicit set form is also rejected" } },
      { daysOfWeek: { set: [1, 2] } },
    ];
    for (const data of cases) {
      expect(() => scopeWriteData(data, "update", A), JSON.stringify(data)).toThrow(TenantScopeError);
      expect(() => scopeWriteData(data, "create", A), JSON.stringify(data)).toThrow(TenantScopeError);
    }
  });

  it("nested create: overwrites a caller-supplied tenantId with the scope value", () => {
    const out = scopeWriteData(
      { sku: "HB", bomItems: { create: [{ tenantId: B, materialId: "m1", quantityPerUnit: 1 }, { tenantId: "x", materialId: "m2", quantityPerUnit: 2 }] } },
      "create",
      A,
    ) as Record<string, unknown>;
    expect(out).toEqual({
      tenantId: A,
      sku: "HB",
      bomItems: {
        create: [
          { tenantId: A, materialId: "m1", quantityPerUnit: 1 },
          { tenantId: A, materialId: "m2", quantityPerUnit: 2 },
        ],
      },
    });
  });

  it("nested create: leaves tenantId absent when the caller did not pass it (composite-FK children inherit it)", () => {
    const out = scopeWriteData(
      { name: "Cal", shifts: { create: { name: "Day", startTime: "09:00", endTime: "17:00", daysOfWeek: [1, 2] } } },
      "update",
      A,
    ) as Record<string, unknown>;
    expect(out).toEqual({
      name: "Cal",
      shifts: { create: { name: "Day", startTime: "09:00", endTime: "17:00", daysOfWeek: [1, 2] } },
    });
  });

  it("nested createMany: rows are treated like nested creates", () => {
    const out = scopeWriteData(
      { bomItems: { createMany: { data: [{ tenantId: B, materialId: "m1" }, { materialId: "m2" }], skipDuplicates: true } } },
      "update",
      A,
    );
    expect(out).toEqual({
      bomItems: { createMany: { data: [{ tenantId: A, materialId: "m1" }, { materialId: "m2" }], skipDuplicates: true } },
    });
  });

  it("nested update / updateMany / upsert data is walked in the matching mode", () => {
    const out = scopeWriteData(
      {
        bomItems: {
          update: [{ where: { id: "b1" }, data: { tenantId: B, note: "n" } }],
          updateMany: { where: { note: null }, data: { tenantId: B, scrapPercent: 2 } },
          upsert: { where: { id: "b2" }, create: { tenantId: B, materialId: "m" }, update: { tenantId: B, note: "u" } },
        },
        workCenter: { update: { tenantId: B, name: "to-one bare data form" } },
      },
      "update",
      A,
    );
    expect(out).toEqual({
      bomItems: {
        update: [{ where: { id: "b1" }, data: { note: "n" } }],
        updateMany: { where: { note: null }, data: { scrapPercent: 2 } },
        upsert: { where: { id: "b2" }, create: { tenantId: A, materialId: "m" }, update: { note: "u" } },
      },
      workCenter: { update: { name: "to-one bare data form" } },
    });
  });

  it("leaves scalar atomic ops, scalar lists, Dates and Decimal-like values untouched", () => {
    const when = new Date("2026-09-05T00:00:00Z");
    const decimalLike = Object.create({ toFixed() {} }) as object; // non-plain object
    const out = scopeWriteData(
      { stockOnHand: { increment: 5 }, daysOfWeek: [1, 2, 3], dueDate: when, quantity: decimalLike, bomItems: { deleteMany: {} } },
      "update",
      A,
    ) as Record<string, unknown>;
    expect(out.stockOnHand).toEqual({ increment: 5 });
    expect(out.daysOfWeek).toEqual([1, 2, 3]);
    expect(out.dueDate).toBe(when);
    expect(out.quantity).toBe(decimalLike);
    expect(out.bomItems).toEqual({ deleteMany: {} });
  });

  it("does not descend into Json columns (rows / before / after)", () => {
    const after = { set: 1, create: { connect: true }, nested: [{ disconnect: true }] };
    const out = scopeWriteData({ entityType: "Order", after, before: { set: 2 } }, "create", A) as Record<string, unknown>;
    expect(out.after).toEqual(after);
    expect(out.before).toEqual({ set: 2 });
    const batch = scopeWriteData({ rows: { set: [1], items: [{ create: 1 }] }, status: "PENDING" }, "update", A);
    expect(batch).toEqual({ rows: { set: [1], items: [{ create: 1 }] }, status: "PENDING" });
  });

  it("returns new objects and never mutates the input", () => {
    const input = { tenantId: B, name: "x", bomItems: { create: [{ tenantId: B, materialId: "m" }] } };
    const snapshot = JSON.parse(JSON.stringify(input));
    scopeWriteData(input, "create", A);
    expect(input).toEqual(snapshot);
  });

  it("passes non-object data through", () => {
    expect(scopeWriteData(undefined, "create", A)).toBeUndefined();
    expect(scopeWriteData(null, "update", A)).toBeNull();
  });
});

describe("scopeArgs — Tenant model (handled by name)", () => {
  it("unique reads are pinned to the scoped tenant while keeping the caller filter", () => {
    for (const op of ["findUnique", "findUniqueOrThrow"]) {
      expect(scopeArgs("Tenant", op, { where: { id: B } }, A).where, op).toEqual({ id: A, AND: [{ id: B }] });
      expect(scopeArgs("Tenant", op, undefined, A).where, op).toEqual({ id: A, AND: [{}] });
    }
  });

  it("list reads / count are AND-filtered on id", () => {
    for (const op of ["findFirst", "findFirstOrThrow", "findMany", "count"]) {
      expect(scopeArgs("Tenant", op, { where: { slug: "acme" } }, A).where, op).toEqual({ AND: [{ slug: "acme" }, { id: A }] });
    }
  });

  it("update is pinned to the scoped tenant and cannot change id or slug", () => {
    const out = scopeArgs(
      "Tenant",
      "update",
      { where: { id: B }, data: { id: "hijack", slug: "hijack", name: "New name", orderSeq: { increment: 3 } }, select: { orderSeq: true } },
      A,
    );
    expect(out.where).toEqual({ id: A, AND: [{ id: B }] });
    expect(out.data).toEqual({ name: "New name", orderSeq: { increment: 3 } });
    expect(out.select).toEqual({ orderSeq: true });
    const many = scopeArgs("Tenant", "updateMany", { data: { slug: "x", timezone: "UTC" } }, A);
    expect(many.where).toEqual({ AND: [{}, { id: A }] });
    expect(many.data).toEqual({ timezone: "UTC" });
  });

  it("rejects relation writes on Tenant (defaultCalendar must be set via defaultCalendarId)", () => {
    expect(() => scopeArgs("Tenant", "update", { where: { id: A }, data: { defaultCalendar: { connect: { id: "c" } } } }, A)).toThrow(
      TenantScopeError,
    );
    expect(() => scopeArgs("Tenant", "update", { where: { id: A }, data: { users: { create: { email: "x" } } } }, A)).not.toThrow();
  });

  it("create / delete / deleteMany / upsert / createMany* / aggregate / groupBy throw", () => {
    for (const op of ["create", "delete", "deleteMany", "upsert", "createMany", "createManyAndReturn", "aggregate", "groupBy", "findRaw"]) {
      expect(() => scopeArgs("Tenant", op, { data: {}, where: { id: A } }, A), op).toThrow(TenantScopeError);
    }
  });
});

describe("scopeArgs — default deny and append-only rules", () => {
  it("throws for operations it does not know", () => {
    for (const op of ["findRaw", "aggregateRaw", "bogus", "$queryRaw"]) {
      expect(() => scopeArgs("Product", op, {}, A), op).toThrow(TenantScopeError);
    }
  });

  it("throws for models without tenantId (RateLimitBucket) and unknown models", () => {
    expect(() => scopeArgs("RateLimitBucket", "findMany", {}, A)).toThrow(TenantScopeError);
    expect(() => scopeArgs("RateLimitBucket", "upsert", { where: { key: "k" }, create: {}, update: {} }, A)).toThrow(TenantScopeError);
    expect(() => scopeArgs("Nope", "findMany", {}, A)).toThrow(TenantScopeError);
  });

  it("AuditLog and StockMovement are append-only", () => {
    for (const model of ["AuditLog", "StockMovement"]) {
      for (const op of ["update", "updateMany", "updateManyAndReturn", "delete", "deleteMany", "upsert"]) {
        expect(() => scopeArgs(model, op, { where: { id: "x" }, data: {} }, A), `${model}.${op}`).toThrow(TenantScopeError);
      }
      for (const op of ["create", "createMany", "createManyAndReturn", "findMany", "findFirst", "count"]) {
        expect(() => scopeArgs(model, op, { data: {} }, A), `${model}.${op}`).not.toThrow();
      }
    }
  });

  it("ImportBatch allows updating only status/counts/rows", () => {
    const ok = scopeArgs(
      "ImportBatch",
      "update",
      { where: { id: "b" }, data: { status: "COMMITTED", importedCount: 5, rows: [], rowCount: 5, validCount: 5, errorCount: 0 } },
      A,
    );
    expect(ok.where).toEqual({ id: "b", tenantId: A });
    expect(() => scopeArgs("ImportBatch", "update", { where: { id: "b" }, data: { fileName: "x.csv" } }, A)).toThrow(
      /only status\/counts\/rows/,
    );
    expect(() => scopeArgs("ImportBatch", "updateMany", { where: {}, data: { createdById: "u" } }, A)).toThrow(TenantScopeError);
    expect(() => scopeArgs("ImportBatch", "upsert", { where: { id: "b" }, create: { fileName: "x" }, update: { fileName: "y" } }, A)).toThrow(
      TenantScopeError,
    );
    expect(() => scopeArgs("ImportBatch", "delete", { where: { id: "b" } }, A)).not.toThrow();
  });

  it("User is never deleted through the scoped client", () => {
    expect(() => scopeArgs("User", "delete", { where: { id: "u" } }, A)).toThrow(TenantScopeError);
    expect(() => scopeArgs("User", "deleteMany", {}, A)).toThrow(TenantScopeError);
    expect(scopeArgs("User", "update", { where: { id: "u" }, data: { isActive: false } }, A).where).toEqual({ id: "u", tenantId: A });
  });

  it("requires a tenantId", () => {
    expect(() => scopeArgs("Product", "findMany", {}, "")).toThrow(TenantScopeError);
  });

  it("TenantScopeError carries model/operation and a stable name", () => {
    try {
      scopeArgs("AuditLog", "delete", { where: { id: "x" } }, A);
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(TenantScopeError);
      const e = err as TenantScopeError;
      expect(e.name).toBe("TenantScopeError");
      expect(e.model).toBe("AuditLog");
      expect(e.operation).toBe("delete");
    }
  });

  it("covers every model that is not Tenant/RateLimitBucket", () => {
    expect(TENANT_SCOPED_MODELS.size).toBe(20);
    expect(TENANT_SCOPED_MODELS.has("Tenant" as never)).toBe(false);
    expect(TENANT_SCOPED_MODELS.has("RateLimitBucket" as never)).toBe(false);
  });
});

describe("tenantDb()", () => {
  it("rejects an empty tenantId before touching the database", () => {
    expect(() => tenantDb("")).toThrow(TenantScopeError);
  });
});

describe("db module loading", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("can be imported without a connection string and fails clearly on first use", async () => {
    vi.resetModules();
    vi.stubEnv("DATABASE_URL", undefined);
    vi.stubEnv("NETLIFY_DB_URL", undefined);
    const mod = await import("@/lib/db");
    expect(() => mod.prisma.tenant).toThrow(/DATABASE_URL/);
    expect(() => mod.tenantDb("t1")).toThrow(/DATABASE_URL/);
  });
});
