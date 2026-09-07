import { beforeEach, describe, expect, it, vi } from "vitest";
import { headers } from "next/headers";
import { Prisma } from "@/generated/prisma/client";
import {
  audit,
  auditContext,
  auditHref,
  changedFields,
  clientIpFromHeaders,
  describeAudit,
  redactSnapshot,
  type AuditCtx,
} from "@/lib/audit";
import type { TenantTx } from "@/lib/db";

vi.mock("next/headers", () => ({ headers: vi.fn() }));

type CreateArgs = { data: Record<string, unknown> };

function fakeTx(tenantId?: string) {
  const create = vi.fn(async (args: CreateArgs) => args.data);
  const tx = { ...(tenantId ? { $tenantId: tenantId } : {}), auditLog: { create } } as unknown as TenantTx;
  return { tx, create };
}

const priya = { id: "u1", email: "priya@acme.test", name: "Priya", tenantId: "tenant_a" };
const ctx: AuditCtx = { actor: priya, ip: "10.0.0.7", userAgent: "vitest" };

describe("audit()", () => {
  it("writes one row with actor snapshot, redacted snapshots and changedFields", async () => {
    const { tx, create } = fakeTx("tenant_a");
    const updatedAt = new Date("2026-09-05T10:00:00Z");
    await audit(tx, ctx, {
      entityType: "Order",
      entityId: "o1",
      entityLabel: "SO-000123",
      action: "UPDATE",
      before: { dueDate: "2026-09-10", priority: "NORMAL", quantity: new Prisma.Decimal("10.000"), passwordHash: "h", tokenVersion: 1, apiToken: "t", clientSecret: "s", updatedAt },
      after: { dueDate: "2026-09-12", priority: "HIGH", quantity: new Prisma.Decimal("10"), passwordHash: "h2", tokenVersion: 2, updatedAt: new Date() },
      summary: "Order SO-000123 updated",
    });

    expect(create).toHaveBeenCalledTimes(1);
    const data = create.mock.calls[0][0].data;
    expect(data).toMatchObject({
      tenantId: "tenant_a",
      actorUserId: "u1",
      actorEmail: "priya@acme.test",
      actorName: "Priya",
      ip: "10.0.0.7",
      userAgent: "vitest",
      entityType: "Order",
      entityId: "o1",
      entityLabel: "SO-000123",
      action: "UPDATE",
      summary: "Order SO-000123 updated",
    });
    expect(data.before).toEqual({ dueDate: "2026-09-10", priority: "NORMAL", quantity: 10 });
    expect(data.after).toEqual({ dueDate: "2026-09-12", priority: "HIGH", quantity: 10 });
    expect(data.changedFields).toEqual(["dueDate", "priority"]);
    expect(JSON.stringify(data)).not.toMatch(/passwordHash|tokenVersion|apiToken|clientSecret|updatedAt/);
  });

  it("handles a null actor and missing request metadata", async () => {
    const { tx, create } = fakeTx("tenant_a");
    await audit(tx, { actor: null }, { entityType: "Tenant", entityId: "tenant_a", action: "CREATE", summary: "Signup", after: { name: "Acme" } });
    const data = create.mock.calls[0][0].data;
    expect(data).toMatchObject({ actorUserId: null, actorEmail: null, actorName: null, ip: null, userAgent: null, entityLabel: null });
    expect(data.before).toBeUndefined();
    expect(data.after).toEqual({ name: "Acme" });
    expect(data.changedFields).toEqual([]);
  });

  it("falls back to the actor's tenantId when the client does not expose $tenantId", async () => {
    const { tx, create } = fakeTx();
    await audit(tx, ctx, { entityType: "Product", entityId: "p", action: "DELETE", summary: "deleted", before: { sku: "X" } });
    expect(create.mock.calls[0][0].data.tenantId).toBe("tenant_a");
    const anon = fakeTx();
    await audit(anon.tx, { actor: null }, { entityType: "Product", entityId: "p", action: "DELETE", summary: "deleted" });
    expect(anon.create.mock.calls[0][0].data.tenantId).toBe("");
  });

  it("stores null snapshots as SQL NULL and truncates long user agents", async () => {
    const { tx, create } = fakeTx("t");
    await audit(tx, { actor: priya, userAgent: "x".repeat(2000) }, { entityType: "Order", entityId: "o", action: "CREATE", summary: "s", before: null, after: null });
    const data = create.mock.calls[0][0].data;
    expect(data.before).toBeUndefined();
    expect(data.after).toBeUndefined();
    expect((data.userAgent as string).length).toBe(512);
  });
});

describe("redactSnapshot / changedFields", () => {
  it("redacts sensitive keys at any depth and converts Prisma values", () => {
    const out = redactSnapshot({
      name: "n",
      password: "p",
      resetToken: "t",
      SECRET_KEY: "s",
      updatedAt: new Date(),
      nested: [{ tokenVersion: 1, qty: new Prisma.Decimal("1.5"), when: new Date("2026-01-01T00:00:00Z") }],
    });
    expect(out).toEqual({ name: "n", nested: [{ qty: 1.5, when: "2026-01-01T00:00:00.000Z" }] });
    expect(redactSnapshot(undefined)).toBeUndefined();
    expect(redactSnapshot(null)).toBeNull();
  });

  it("keeps mustChangePassword out of snapshots (matches /password/i) — documented behaviour", () => {
    expect(redactSnapshot({ mustChangePassword: true, name: "n" })).toEqual({ name: "n" });
  });

  it("computes a shallow diff over the union of keys, ignoring key order in nested values", () => {
    expect(changedFields({ a: 1, b: { x: 1, y: 2 }, c: [1] }, { a: 2, b: { y: 2, x: 1 }, c: [1, 2], d: "new" })).toEqual(["a", "c", "d"]);
    expect(changedFields({ gone: 1 }, {})).toEqual(["gone"]);
    expect(changedFields({ a: 1 }, { a: 1 })).toEqual([]);
  });

  it("returns [] unless both snapshots are objects", () => {
    expect(changedFields(undefined, { a: 1 })).toEqual([]);
    expect(changedFields({ a: 1 }, null)).toEqual([]);
    expect(changedFields([1], [2])).toEqual([]);
  });
});

describe("auditContext()", () => {
  const mockedHeaders = vi.mocked(headers);

  beforeEach(() => {
    mockedHeaders.mockReset();
  });

  it("prefers x-nf-client-connection-ip", async () => {
    mockedHeaders.mockResolvedValue(new Headers({ "x-nf-client-connection-ip": "203.0.113.9", "x-forwarded-for": "1.1.1.1, 2.2.2.2", "user-agent": "UA" }) as never);
    const out = await auditContext({ user: priya });
    expect(out).toEqual({ actor: priya, ip: "203.0.113.9", userAgent: "UA" });
  });

  it("falls back to the last hop of x-forwarded-for", async () => {
    mockedHeaders.mockResolvedValue(new Headers({ "x-forwarded-for": "1.1.1.1, 2.2.2.2 , 3.3.3.3" }) as never);
    const out = await auditContext({ user: priya });
    expect(out.ip).toBe("3.3.3.3");
    expect(out.userAgent).toBeNull();
  });

  it("returns nulls when headers() is unavailable (outside a request scope) and handles a null session", async () => {
    mockedHeaders.mockRejectedValue(new Error("headers was called outside a request scope"));
    const out = await auditContext(null);
    expect(out).toEqual({ actor: null, ip: null, userAgent: null });
  });

  it("clientIpFromHeaders returns null without any hint", () => {
    expect(clientIpFromHeaders(new Headers())).toBeNull();
    expect(clientIpFromHeaders(new Headers({ "x-forwarded-for": " , " }))).toBeNull();
  });
});

describe("describeAudit()", () => {
  it("renders updates with changed fields and links to the detail page", () => {
    expect(
      describeAudit({ action: "UPDATE", entityType: "Order", entityId: "o1", entityLabel: "SO-000123", actorName: "Priya", changedFields: ["dueDate", "priority"] }),
    ).toEqual({ text: "Priya updated Order SO-000123 (dueDate, priority)", href: "/orders/o1" });
  });

  it("maps every entity type to its route", () => {
    const cases: [string, string | null][] = [
      ["Order", "/orders/x"],
      ["Product", "/products/x"],
      ["Material", "/materials/x"],
      ["Machine", "/machines/x"],
      ["Customer", "/customers/x"],
      ["ShiftCalendar", "/calendars/x"],
      ["WorkCenter", "/work-centers"],
      ["User", "/settings/users"],
      ["BomItem", "/products"],
      ["ProductOperation", "/products"],
      ["StockMovement", "/materials"],
      ["DowntimeWindow", "/machines"],
      ["Shift", "/calendars"],
      ["CalendarException", "/calendars"],
      ["ImportBatch", "/orders?batch=x&status=all"],
      ["Tenant", null],
      ["Unknown", null],
    ];
    for (const [entityType, href] of cases) {
      expect(auditHref({ action: "CREATE", entityType, entityId: "x" }), entityType).toBe(href);
    }
  });

  it("links deletions to the list page instead of a missing detail page", () => {
    expect(describeAudit({ action: "DELETE", entityType: "Order", entityId: "o1", entityLabel: "SO-1", actorName: "Priya" })).toEqual({
      text: "Priya deleted Order SO-1",
      href: "/orders",
    });
    expect(auditHref({ action: "DELETE", entityType: "Tenant", entityId: "t" })).toBeNull();
  });

  it("uses the email when the name is missing and 'System' when there is no actor", () => {
    expect(describeAudit({ action: "CREATE", entityType: "Product", entityId: "p", entityLabel: "HB-200", actorEmail: "a@b.test" }).text).toBe(
      "a@b.test created Product HB-200",
    );
    expect(describeAudit({ action: "IMPORT", entityType: "ImportBatch", entityId: "b", entityLabel: "orders.csv" }).text).toBe(
      "System imported CSV import orders.csv",
    );
  });

  it("renders LOGIN, STATUS_CHANGE, Tenant and unknown entity types", () => {
    expect(describeAudit({ action: "LOGIN", entityType: "User", entityId: "u", actorName: "Priya" })).toEqual({ text: "Priya signed in", href: null });
    expect(describeAudit({ action: "STATUS_CHANGE", entityType: "Order", entityId: "o", entityLabel: "SO-2", actorName: "Ravi" }).text).toBe(
      "Ravi changed status of Order SO-2",
    );
    expect(describeAudit({ action: "UPDATE", entityType: "Tenant", entityId: "t", actorName: "Priya", changedFields: ["timezone"] })).toEqual({
      text: "Priya updated Plant settings (timezone)",
      href: null,
    });
    expect(describeAudit({ action: "CREATE", entityType: "FooBarBaz", entityId: "1", actorName: "P" }).text).toBe("P created Foo Bar Baz");
  });

  it("omits the changed-field list for non-UPDATE actions and empty diffs", () => {
    expect(describeAudit({ action: "CREATE", entityType: "Order", entityId: "o", entityLabel: "SO-3", actorName: "P", changedFields: ["a"] }).text).toBe(
      "P created Order SO-3",
    );
    expect(describeAudit({ action: "UPDATE", entityType: "Order", entityId: "o", entityLabel: "SO-3", actorName: "P", changedFields: [] }).text).toBe(
      "P updated Order SO-3",
    );
  });
});
