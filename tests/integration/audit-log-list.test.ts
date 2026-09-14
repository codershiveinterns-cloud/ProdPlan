/**
 * Integration: src/lib/audit-log-list.ts — filters (entityType, action, actorId, from/to, q), pagination (25/page),
 * tenant isolation, docs/M3_SPEC.md §9.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import {
  AUDIT_LOG_PAGE_SIZE,
  auditLogListWhere,
  listAuditActorOptions,
  listAuditLog,
  parseAuditLogListParams,
} from "@/lib/audit-log-list";
import { createTenantFixture, dbAvailable, deleteTenant, disconnectDb, type TenantFixture } from "./helpers";

const available = await dbAvailable();

describe.skipIf(!available)("audit log list (integration)", () => {
  let f: TenantFixture;
  let other: TenantFixture;
  let secondUserId: string;

  beforeAll(async () => {
    f = await createTenantFixture({ slugPrefix: "audit-list" });
    other = await createTenantFixture({ slugPrefix: "audit-list-b" });
    const secondUser = await prisma.user.create({
      data: { tenantId: f.tenant.id, email: `second-${f.tenant.slug}@example.test`, name: "Priya Sharma", passwordHash: "x", role: "PLANNER" },
    });
    secondUserId = secondUser.id;

    await prisma.auditLog.createMany({
      data: [
        {
          tenantId: f.tenant.id,
          actorUserId: f.admin.id,
          actorName: f.admin.name,
          entityType: "Order",
          entityId: "o1",
          entityLabel: "SO-000001",
          action: "CREATE",
          summary: "Order SO-000001 created",
          changedFields: [],
          createdAt: new Date("2026-01-05T10:00:00Z"),
        },
        {
          tenantId: f.tenant.id,
          actorUserId: secondUserId,
          actorName: "Priya Sharma",
          entityType: "Order",
          entityId: "o1",
          entityLabel: "SO-000001",
          action: "STATUS_CHANGE",
          summary: "Order SO-000001 status QUEUED → ON_HOLD",
          changedFields: ["status"],
          createdAt: new Date("2026-01-06T10:00:00Z"),
        },
        {
          tenantId: f.tenant.id,
          actorUserId: f.admin.id,
          actorName: f.admin.name,
          entityType: "Material",
          entityId: "m1",
          entityLabel: "AL-BAR",
          action: "UPDATE",
          summary: "Material AL-BAR updated",
          changedFields: ["reorderThreshold"],
          createdAt: new Date("2026-02-01T10:00:00Z"),
        },
        // Another tenant's row must never leak into f's results.
        {
          tenantId: other.tenant.id,
          actorUserId: other.admin.id,
          actorName: other.admin.name,
          entityType: "Order",
          entityId: "o-other",
          action: "CREATE",
          summary: "Order SO-999999 created",
          changedFields: [],
          createdAt: new Date("2026-01-05T10:00:00Z"),
        },
      ],
    });
  });

  afterAll(async () => {
    await deleteTenant(f?.tenant.id);
    await deleteTenant(other?.tenant.id);
    await disconnectDb();
  });

  it("lists newest first, scoped to the tenant", async () => {
    const params = parseAuditLogListParams({});
    const { rows, total } = await listAuditLog(f.db, params, f.tenant.timezone);
    expect(total).toBe(3);
    expect(rows.map((r) => r.summary)).toEqual([
      "Material AL-BAR updated",
      "Order SO-000001 status QUEUED → ON_HOLD",
      "Order SO-000001 created",
    ]);
  });

  it("filters by entityType", async () => {
    const params = parseAuditLogListParams({ entityType: "Material" });
    const { rows, total } = await listAuditLog(f.db, params, f.tenant.timezone);
    expect(total).toBe(1);
    expect(rows[0]!.entityType).toBe("Material");
  });

  it("filters by action", async () => {
    const params = parseAuditLogListParams({ action: "status_change" });
    const { rows, total } = await listAuditLog(f.db, params, f.tenant.timezone);
    expect(total).toBe(1);
    expect(rows[0]!.action).toBe("STATUS_CHANGE");
  });

  it("an unknown action value is ignored (falls back to no filter)", async () => {
    const params = parseAuditLogListParams({ action: "not-a-real-action" });
    expect(params.action).toBe("");
    const { total } = await listAuditLog(f.db, params, f.tenant.timezone);
    expect(total).toBe(3);
  });

  it("filters by actorId", async () => {
    const params = parseAuditLogListParams({ actorId: secondUserId });
    const { rows, total } = await listAuditLog(f.db, params, f.tenant.timezone);
    expect(total).toBe(1);
    expect(rows[0]!.actorUserId).toBe(secondUserId);
  });

  it("filters by from/to date range (tenant timezone)", async () => {
    const params = parseAuditLogListParams({ from: "2026-01-06", to: "2026-01-06" });
    const { rows, total } = await listAuditLog(f.db, params, f.tenant.timezone);
    expect(total).toBe(1);
    expect(rows[0]!.summary).toContain("ON_HOLD");
  });

  it("q searches summary, entity label and actor name", async () => {
    const bySummary = await listAuditLog(f.db, parseAuditLogListParams({ q: "reorder" }), f.tenant.timezone);
    expect(bySummary.total).toBe(0); // "reorder" is a changed field, not summary/label/actor text
    const byActor = await listAuditLog(f.db, parseAuditLogListParams({ q: "priya" }), f.tenant.timezone);
    expect(byActor.total).toBe(1);
    const byLabel = await listAuditLog(f.db, parseAuditLogListParams({ q: "SO-000001" }), f.tenant.timezone);
    expect(byLabel.total).toBe(2);
  });

  it("paginates 25/page", async () => {
    expect(AUDIT_LOG_PAGE_SIZE).toBe(25);
    const params = parseAuditLogListParams({ page: "2" });
    const { rows, total } = await listAuditLog(f.db, params, f.tenant.timezone);
    expect(total).toBe(3);
    expect(rows).toHaveLength(0); // only 3 rows total, page 2 is empty
  });

  it("auditLogListWhere returns {} (no AND) when every filter is empty", () => {
    expect(auditLogListWhere(parseAuditLogListParams({}), f.tenant.timezone)).toEqual({});
  });

  it("listAuditActorOptions lists active users of the tenant, name-sorted", async () => {
    const actors = await listAuditActorOptions(f.db);
    expect(actors.map((a) => a.name).sort()).toEqual([f.admin.name, "Priya Sharma"].sort());
  });
});
