/**
 * Integration: `applySuggestion()` / `dismissSuggestion()` (docs/M3_SPEC.md §3) — apply through the SAME
 * primitives the board uses (`moveEntry()` for REASSIGN_MACHINE, `Order.priority` + `runSchedule()` for
 * REPRIORITIZE), audited, notified, and tenant-isolated; dismiss is a plain status flip; neither is allowed on a
 * suggestion that is no longer PENDING.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { toUserDTO } from "@/lib/auth/user-dto";
import type { AuditCtx } from "@/lib/audit";
import { prisma } from "@/lib/db";
import type { Session } from "@/lib/auth/session";
import { DomainError } from "@/lib/errors";
import { applySuggestion, dismissSuggestion } from "@/lib/optimization/apply";
import { generateSuggestions } from "@/lib/optimization/suggest";
import { scheduleOrders } from "@/lib/scheduling/engine";
import { loadEngineInput, runSchedule } from "@/lib/scheduling/run";
import { createTenantFixture, dbAvailable, deleteTenant, disconnectDb, type TenantFixture } from "./helpers";

const available = await dbAvailable();

function sessionFor(f: TenantFixture): Session {
  return {
    user: toUserDTO(f.admin),
    tenant: { id: f.tenant.id, name: f.tenant.name, slug: f.tenant.slug, timezone: f.tenant.timezone, defaultCalendarId: f.tenant.defaultCalendarId },
  };
}

function ctxFor(f: TenantFixture): AuditCtx {
  return { actor: { id: f.admin.id, email: f.admin.email, name: f.admin.name, tenantId: f.tenant.id } };
}

const NOW = new Date("2026-09-14T03:30:00.000Z"); // Monday 09:00 IST

describe.skipIf(!available)("applySuggestion / dismissSuggestion (integration)", () => {
  let f: TenantFixture;

  beforeAll(async () => {
    f = await createTenantFixture({ slugPrefix: "opt-apply" });
  });

  afterAll(async () => {
    await deleteTenant(f?.tenant.id);
    await disconnectDb();
  });

  /**
   * X (HIGH, free-choice step, forced AT_RISK by a material shortage unrelated to machine choice) and Z (NORMAL,
   * pinned to M-1) both want the one work center's two machines. The engine's greedy per-order placement processes
   * X first and ties M-1/M-2 (both free, same duration); the tie-break ("lower machine code") lands X on M-1,
   * which then blocks Z (which has no choice) for ~7 days, making Z DELAYED — exactly the cross-order case
   * `generateSuggestions()`'s REASSIGN_MACHINE perturbation is meant to find (see
   * tests/unit/optimization-suggest.test.ts for the pure-engine version of this scenario).
   */
  async function seedReassignScenario(suffix = "1") {
    const wc = await prisma.workCenter.create({ data: { tenantId: f.tenant.id, code: `WC${suffix}`, name: `Work centre ${suffix}` } });
    const m1 = await prisma.machine.create({ data: { tenantId: f.tenant.id, workCenterId: wc.id, calendarId: f.calendar.id, code: `M-${suffix}a`, name: `Machine ${suffix}a` } });
    const m2 = await prisma.machine.create({ data: { tenantId: f.tenant.id, workCenterId: wc.id, calendarId: f.calendar.id, code: `M-${suffix}b`, name: `Machine ${suffix}b` } });
    const material = await prisma.material.create({ data: { tenantId: f.tenant.id, code: `RM-${suffix}`, name: `Raw material ${suffix}`, unit: "kg", stockOnHand: 0 } });
    const customer = await prisma.customer.create({ data: { tenantId: f.tenant.id, name: `Acme Reassign ${suffix}` } });

    const productX = await prisma.product.create({ data: { tenantId: f.tenant.id, sku: `SKU-X${suffix}`, name: `Widget X${suffix}`, unit: "pcs" } });
    await prisma.productOperation.create({
      data: { tenantId: f.tenant.id, productId: productX.id, sequence: 10, workCenterId: wc.id, setupMinutes: 0, runMinutesPerUnit: 10 },
    });
    await prisma.bomItem.create({ data: { tenantId: f.tenant.id, productId: productX.id, materialId: material.id, quantityPerUnit: 1 } });
    const orderX = await prisma.order.create({
      data: {
        tenantId: f.tenant.id,
        orderNumber: `SO-X-${suffix}`,
        customerId: customer.id,
        productId: productX.id,
        quantity: 1000, // ~6.9 days on either machine
        priority: "HIGH",
        dueDate: new Date("2026-12-01T00:00:00.000Z"),
        status: "QUEUED",
        createdById: f.admin.id,
      },
    });

    const productZ = await prisma.product.create({ data: { tenantId: f.tenant.id, sku: `SKU-Z${suffix}`, name: `Widget Z${suffix}`, unit: "pcs" } });
    await prisma.productOperation.create({
      data: { tenantId: f.tenant.id, productId: productZ.id, sequence: 10, workCenterId: wc.id, machineId: m1.id, setupMinutes: 10, runMinutesPerUnit: 10 },
    });
    const orderZ = await prisma.order.create({
      data: {
        tenantId: f.tenant.id,
        orderNumber: `SO-Z-${suffix}`,
        customerId: customer.id,
        productId: productZ.id,
        quantity: 1,
        priority: "NORMAL",
        dueDate: new Date("2026-09-16T00:00:00.000Z"), // 2 days out — blocked behind X on M-1 otherwise
        status: "QUEUED",
        createdById: f.admin.id,
      },
    });

    return { wc, m1, m2, orderX, orderZ };
  }

  it("applies a REASSIGN_MACHINE suggestion via moveEntry, audits it and notifies", async () => {
    const scenario = await seedReassignScenario();
    const session = sessionFor(f);
    const ctx = ctxFor(f);

    await runSchedule(f.db, session, ctx, { trigger: "manual", now: NOW });
    const before = await prisma.order.findUniqueOrThrow({ where: { id: scenario.orderZ.id } });
    expect(before.deliveryRisk).not.toBe("ON_TRACK");

    const other = await prisma.user.create({
      data: { tenantId: f.tenant.id, email: `planner@${f.tenant.slug}.test`, name: "Planner", passwordHash: "x", role: "PLANNER" },
    });

    // Same call sequence src/lib/optimization/generate.ts makes to produce a real, currently-improving suggestion.
    const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: f.tenant.id } });
    const horizonEnd = new Date(NOW.getTime() + 30 * 24 * 60 * 60 * 1000);
    const loaded = await loadEngineInput(f.db, NOW, horizonEnd);
    const opts = { now: NOW, horizonDays: 30, tz: session.tenant.timezone, defaultCalendarId: tenant.defaultCalendarId };
    const baseline = scheduleOrders(loaded.input, opts);
    const fresh = generateSuggestions(loaded.input, baseline, opts);
    const found = fresh.find((s) => s.kind === "REASSIGN_MACHINE" && s.orderId === scenario.orderX.id);
    expect(found).toBeDefined();

    const entry = await prisma.scheduleEntry.findFirstOrThrow({ where: { orderId: scenario.orderX.id, sequence: found!.sequence! } });
    const suggestion = await prisma.optimizationSuggestion.create({
      data: {
        tenantId: f.tenant.id,
        kind: "REASSIGN_MACHINE",
        status: "PENDING",
        orderId: scenario.orderX.id,
        entryId: entry.id,
        fromMachineId: found!.fromMachineId,
        toMachineId: found!.toMachineId,
        currentConflicts: found!.currentConflicts,
        projectedConflicts: found!.projectedConflicts,
        currentLateMinutes: found!.currentLateMinutes,
        projectedLateMinutes: found!.projectedLateMinutes,
        summary: found!.summary,
        rationale: found!.rationale,
      },
    });

    const result = await applySuggestion(f.db, session, ctx, suggestion.id);
    expect(result.status).toBe("COMPLETED");

    const updatedEntry = await prisma.scheduleEntry.findUniqueOrThrow({ where: { id: entry.id } });
    expect(updatedEntry.machineId).toBe(found!.toMachineId);
    expect(updatedEntry.locked).toBe(true);

    const updatedZ = await prisma.order.findUniqueOrThrow({ where: { id: scenario.orderZ.id } });
    expect(updatedZ.deliveryRisk).toBe("ON_TRACK"); // freed M-1, Z now schedules right away

    const updatedSuggestion = await prisma.optimizationSuggestion.findUniqueOrThrow({ where: { id: suggestion.id } });
    expect(updatedSuggestion.status).toBe("APPLIED");
    expect(updatedSuggestion.appliedById).toBe(f.admin.id);
    expect(updatedSuggestion.appliedAt).not.toBeNull();

    const auditRows = await prisma.auditLog.findMany({ where: { tenantId: f.tenant.id, entityType: "OptimizationSuggestion", entityId: suggestion.id } });
    expect(auditRows.some((r) => r.action === "STATUS_CHANGE")).toBe(true);

    const notifRows = await prisma.notification.findMany({ where: { tenantId: f.tenant.id, userId: other.id, dedupeKey: `optimization:${suggestion.id}` } });
    expect(notifRows).toHaveLength(1);
  });

  it("applies a REPRIORITIZE suggestion by updating Order.priority and re-running the schedule", async () => {
    // "blocker" is HIGH and processed first regardless of due date, occupying the only machine for ~10 days.
    // "target" is NORMAL with a due date 2 days out, so it is stuck behind — DELAYED. Bumping it NORMAL -> HIGH
    // ties it with "blocker"; the tie-break (due date asc) then puts target first (same shape as the pure-engine
    // version of this scenario in tests/unit/optimization-suggest.test.ts).
    const wc = await prisma.workCenter.create({ data: { tenantId: f.tenant.id, code: "WC2", name: "Work centre 2" } });
    await prisma.machine.create({ data: { tenantId: f.tenant.id, workCenterId: wc.id, calendarId: f.calendar.id, code: "M-3", name: "Machine 3" } });
    const customer = await prisma.customer.create({ data: { tenantId: f.tenant.id, name: "Acme Repri" } });

    // Tenant fixture calendars run 09:00-17:00 (60 min break, ~420 working min/day) rather than 24/7 — sized so
    // the blocker fits comfortably inside the horizon (unlike an always-open calendar, it does NOT translate to
    // wall-clock days 1:1) while still running long enough to push "target" past its due date.
    const blockerProduct = await prisma.product.create({ data: { tenantId: f.tenant.id, sku: "SKU-BLOCKER", name: "Blocker", unit: "pcs" } });
    await prisma.productOperation.create({
      data: { tenantId: f.tenant.id, productId: blockerProduct.id, sequence: 10, workCenterId: wc.id, setupMinutes: 0, runMinutesPerUnit: 250 },
    });
    await prisma.order.create({
      data: {
        tenantId: f.tenant.id,
        orderNumber: "SO-BLOCKER-1",
        customerId: customer.id,
        productId: blockerProduct.id,
        quantity: 10, // 2500 min ~ 6 working days
        priority: "HIGH",
        dueDate: new Date("2026-12-01T00:00:00.000Z"),
        status: "QUEUED",
        createdById: f.admin.id,
      },
    });

    const targetProduct = await prisma.product.create({ data: { tenantId: f.tenant.id, sku: "SKU-TARGET", name: "Target", unit: "pcs" } });
    await prisma.productOperation.create({
      data: { tenantId: f.tenant.id, productId: targetProduct.id, sequence: 10, workCenterId: wc.id, setupMinutes: 10, runMinutesPerUnit: 10 },
    });
    const targetOrder = await prisma.order.create({
      data: {
        tenantId: f.tenant.id,
        orderNumber: "SO-TARGET-1",
        customerId: customer.id,
        productId: targetProduct.id,
        quantity: 1,
        priority: "NORMAL",
        dueDate: new Date("2026-09-15T00:00:00.000Z"), // next day — stuck behind "blocker" otherwise
        status: "QUEUED",
        createdById: f.admin.id,
      },
    });

    const session = sessionFor(f);
    const ctx = ctxFor(f);
    await runSchedule(f.db, session, ctx, { trigger: "manual", now: NOW });
    const before = await prisma.order.findUniqueOrThrow({ where: { id: targetOrder.id } });
    expect(before.deliveryRisk).toBe("DELAYED");

    const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: f.tenant.id } });
    const horizonEnd = new Date(NOW.getTime() + 30 * 24 * 60 * 60 * 1000);
    const loaded = await loadEngineInput(f.db, NOW, horizonEnd);
    const opts = { now: NOW, horizonDays: 30, tz: session.tenant.timezone, defaultCalendarId: tenant.defaultCalendarId };
    const baseline = scheduleOrders(loaded.input, opts);
    const fresh = generateSuggestions(loaded.input, baseline, opts);
    const found = fresh.find((s) => s.kind === "REPRIORITIZE" && s.orderId === targetOrder.id);
    expect(found).toBeDefined();
    expect(found!.toPriority).toBe("HIGH");

    const suggestion = await prisma.optimizationSuggestion.create({
      data: {
        tenantId: f.tenant.id,
        kind: "REPRIORITIZE",
        status: "PENDING",
        orderId: targetOrder.id,
        fromPriority: found!.fromPriority,
        toPriority: found!.toPriority,
        currentConflicts: found!.currentConflicts,
        projectedConflicts: found!.projectedConflicts,
        currentLateMinutes: found!.currentLateMinutes,
        projectedLateMinutes: found!.projectedLateMinutes,
        summary: found!.summary,
        rationale: found!.rationale,
      },
    });

    await applySuggestion(f.db, session, ctx, suggestion.id);

    const updatedOrder = await prisma.order.findUniqueOrThrow({ where: { id: targetOrder.id } });
    expect(updatedOrder.priority).toBe("HIGH");
    expect(updatedOrder.deliveryRisk).not.toBe("DELAYED"); // was DELAYED; reprioritizing moved it out of the danger zone

    const orderAuditRows = await prisma.auditLog.findMany({ where: { tenantId: f.tenant.id, entityType: "Order", entityId: targetOrder.id, action: "UPDATE" } });
    expect(orderAuditRows.length).toBeGreaterThan(0);

    const updatedSuggestion = await prisma.optimizationSuggestion.findUniqueOrThrow({ where: { id: suggestion.id } });
    expect(updatedSuggestion.status).toBe("APPLIED");
  });

  it("concurrent applySuggestion calls on the same suggestion: exactly one wins, the schedule is only mutated once", async () => {
    const scenario = await seedReassignScenario("3");
    const session = sessionFor(f);
    const ctx = ctxFor(f);

    await runSchedule(f.db, session, ctx, { trigger: "manual", now: NOW });

    const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: f.tenant.id } });
    const horizonEnd = new Date(NOW.getTime() + 30 * 24 * 60 * 60 * 1000);
    const loaded = await loadEngineInput(f.db, NOW, horizonEnd);
    const opts = { now: NOW, horizonDays: 30, tz: session.tenant.timezone, defaultCalendarId: tenant.defaultCalendarId };
    const baseline = scheduleOrders(loaded.input, opts);
    const fresh = generateSuggestions(loaded.input, baseline, opts);
    const found = fresh.find((s) => s.kind === "REASSIGN_MACHINE" && s.orderId === scenario.orderX.id);
    expect(found).toBeDefined();

    const entry = await prisma.scheduleEntry.findFirstOrThrow({ where: { orderId: scenario.orderX.id, sequence: found!.sequence! } });
    const suggestion = await prisma.optimizationSuggestion.create({
      data: {
        tenantId: f.tenant.id,
        kind: "REASSIGN_MACHINE",
        status: "PENDING",
        orderId: scenario.orderX.id,
        entryId: entry.id,
        fromMachineId: found!.fromMachineId,
        toMachineId: found!.toMachineId,
        currentConflicts: found!.currentConflicts,
        projectedConflicts: found!.projectedConflicts,
        currentLateMinutes: found!.currentLateMinutes,
        projectedLateMinutes: found!.projectedLateMinutes,
        summary: found!.summary,
        rationale: found!.rationale,
      },
    });

    const runsBefore = await prisma.scheduleRun.count({ where: { tenantId: f.tenant.id } });

    // Two "simultaneous" apply calls for the SAME suggestion (double-click / two admins) — only one may actually
    // move the schedule; the other must see the atomic PENDING-guarded claim fail and back off cleanly.
    const results = await Promise.allSettled([
      applySuggestion(f.db, session, ctx, suggestion.id),
      applySuggestion(f.db, session, ctx, suggestion.id),
    ]);
    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(DomainError);

    const runsAfter = await prisma.scheduleRun.count({ where: { tenantId: f.tenant.id } });
    expect(runsAfter).toBe(runsBefore + 1); // exactly one runSchedule() from the winning apply, not two

    const updatedSuggestion = await prisma.optimizationSuggestion.findUniqueOrThrow({ where: { id: suggestion.id } });
    expect(updatedSuggestion.status).toBe("APPLIED");

    const auditRows = await prisma.auditLog.findMany({
      where: { tenantId: f.tenant.id, entityType: "OptimizationSuggestion", entityId: suggestion.id, action: "STATUS_CHANGE" },
    });
    expect(auditRows).toHaveLength(1); // not double-audited by the losing call
  });

  it("refuses to apply a suggestion that is no longer PENDING", async () => {
    const suggestion = await prisma.optimizationSuggestion.create({
      data: {
        tenantId: f.tenant.id,
        kind: "REPRIORITIZE",
        status: "DISMISSED",
        orderId: (await prisma.order.findFirstOrThrow({ where: { tenantId: f.tenant.id } })).id,
        fromPriority: "LOW",
        toPriority: "NORMAL",
        currentConflicts: 0,
        projectedConflicts: 0,
        currentLateMinutes: 0,
        projectedLateMinutes: 0,
        summary: "already dismissed",
        rationale: "test fixture",
      },
    });
    await expect(applySuggestion(f.db, sessionFor(f), ctxFor(f), suggestion.id)).rejects.toThrow(DomainError);
  });

  it("dismisses a PENDING suggestion, audits it, and never touches the schedule", async () => {
    const order = await prisma.order.findFirstOrThrow({ where: { tenantId: f.tenant.id } });
    const suggestion = await prisma.optimizationSuggestion.create({
      data: {
        tenantId: f.tenant.id,
        kind: "REPRIORITIZE",
        status: "PENDING",
        orderId: order.id,
        fromPriority: "LOW",
        toPriority: "NORMAL",
        currentConflicts: 0,
        projectedConflicts: 0,
        currentLateMinutes: 0,
        projectedLateMinutes: 0,
        summary: "dismiss me",
        rationale: "test fixture",
      },
    });
    const runsBefore = await prisma.scheduleRun.count({ where: { tenantId: f.tenant.id } });

    await dismissSuggestion(f.db, sessionFor(f), ctxFor(f), suggestion.id);

    const updated = await prisma.optimizationSuggestion.findUniqueOrThrow({ where: { id: suggestion.id } });
    expect(updated.status).toBe("DISMISSED");
    expect(updated.dismissedById).toBe(f.admin.id);
    expect(updated.dismissedAt).not.toBeNull();

    const auditRows = await prisma.auditLog.findMany({ where: { tenantId: f.tenant.id, entityType: "OptimizationSuggestion", entityId: suggestion.id } });
    expect(auditRows.some((r) => r.action === "STATUS_CHANGE")).toBe(true);

    const runsAfter = await prisma.scheduleRun.count({ where: { tenantId: f.tenant.id } });
    expect(runsAfter).toBe(runsBefore);

    await expect(dismissSuggestion(f.db, sessionFor(f), ctxFor(f), suggestion.id)).rejects.toThrow(DomainError);
  });
});

// Sanity: loadEngineInput/scheduleOrders/generateSuggestions compose correctly against real tenant data (the
// exact call sequence src/lib/optimization/generate.ts makes) — a smoke test, not a rules test (suggest.ts's own
// unit tests cover the rules).
describe.skipIf(!available)("loadEngineInput + generateSuggestions (integration smoke test)", () => {
  it("runs against a real tenant without throwing", async () => {
    const f2 = await createTenantFixture({ slugPrefix: "opt-smoke" });
    try {
      const session = sessionFor(f2);
      const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: f2.tenant.id } });
      const horizonEnd = new Date(NOW.getTime() + 30 * 24 * 60 * 60 * 1000);
      const loaded = await loadEngineInput(f2.db, NOW, horizonEnd);
      const opts = { now: NOW, horizonDays: 30, tz: session.tenant.timezone, defaultCalendarId: tenant.defaultCalendarId };
      const baseline = scheduleOrders(loaded.input, opts);
      expect(baseline.stats.ordersConsidered).toBe(0);
      expect(generateSuggestions(loaded.input, baseline, opts)).toEqual([]);
    } finally {
      await deleteTenant(f2.tenant.id);
    }
  });
});
