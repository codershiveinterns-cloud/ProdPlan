/**
 * Integration: `runSchedule()` (docs/M2_SPEC.md §2 "run.ts", §7) — persists entries/conflicts/order fields
 * atomically in one transaction, is idempotent for unchanged input, fans out the "schedule updated" notification,
 * and every scheduling table is strictly tenant-isolated.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { toUserDTO } from "@/lib/auth/user-dto";
import { prisma } from "@/lib/db";
import type { AuditCtx } from "@/lib/audit";
import type { Session } from "@/lib/auth/session";
import { runSchedule } from "@/lib/scheduling/run";
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

const RUN_NOW = new Date("2026-09-14T03:30:00.000Z"); // Monday 09:00 IST

async function seedOnePlant(f: TenantFixture) {
  const wc = await prisma.workCenter.create({ data: { tenantId: f.tenant.id, code: "WC1", name: "Work centre 1" } });
  const machine = await prisma.machine.create({ data: { tenantId: f.tenant.id, workCenterId: wc.id, calendarId: f.calendar.id, code: "M-1", name: "Machine 1" } });
  const product = await prisma.product.create({ data: { tenantId: f.tenant.id, sku: "SKU-1", name: "Widget", unit: "pcs" } });
  const operation = await prisma.productOperation.create({
    data: { tenantId: f.tenant.id, productId: product.id, sequence: 10, workCenterId: wc.id, setupMinutes: 15, runMinutesPerUnit: 2 },
  });
  const customer = await prisma.customer.create({ data: { tenantId: f.tenant.id, name: "Acme" } });
  const order = await prisma.order.create({
    data: {
      tenantId: f.tenant.id,
      orderNumber: "SO-000001",
      customerId: customer.id,
      productId: product.id,
      quantity: 10,
      dueDate: new Date("2026-12-01T00:00:00.000Z"),
      status: "QUEUED",
      createdById: f.admin.id,
    },
  });
  return { wc, machine, product, operation, customer, order };
}

describe.skipIf(!available)("runSchedule (integration)", () => {
  let a: TenantFixture;
  let b: TenantFixture;

  beforeAll(async () => {
    a = await createTenantFixture({ slugPrefix: "sched-run-a" });
    b = await createTenantFixture({ slugPrefix: "sched-run-b" });
  });

  afterAll(async () => {
    await deleteTenant(a?.tenant.id);
    await deleteTenant(b?.tenant.id);
    await disconnectDb();
  });

  it("persists entries/conflicts/order fields atomically and is idempotent for unchanged input", async () => {
    const seeded = await seedOnePlant(a);
    const session = sessionFor(a);
    const ctx = ctxFor(a);

    const first = await runSchedule(a.db, session, ctx, { trigger: "manual", now: RUN_NOW });
    expect(first.status).toBe("COMPLETED");
    expect(first.entriesCreated).toBe(1);
    expect(first.stats.ordersScheduled).toBe(1);

    const entriesAfterFirst = await prisma.scheduleEntry.findMany({ where: { tenantId: a.tenant.id } });
    expect(entriesAfterFirst).toHaveLength(1);
    const entry = entriesAfterFirst[0]!;
    expect(entry.orderId).toBe(seeded.order.id);
    expect(entry.machineId).toBe(seeded.machine.id);
    expect(entry.status).toBe("QUEUED");

    const orderAfterFirst = await prisma.order.findUniqueOrThrow({ where: { id: seeded.order.id } });
    expect(orderAfterFirst.scheduleDirty).toBe(false);
    expect(orderAfterFirst.deliveryRisk).toBe("ON_TRACK");
    expect(orderAfterFirst.plannedStartAt).not.toBeNull();
    expect(orderAfterFirst.plannedEndAt).not.toBeNull();

    const tenantAfterFirst = await prisma.tenant.findUniqueOrThrow({ where: { id: a.tenant.id } });
    expect(tenantAfterFirst.lastScheduleRunAt).not.toBeNull();

    const auditRows = await prisma.auditLog.findMany({ where: { tenantId: a.tenant.id, entityType: "ScheduleRun" } });
    expect(auditRows).toHaveLength(1);

    // "Schedule updated" notifies ADMIN+PLANNER, excluding the actor (the admin who triggered it).
    const notifRows = await prisma.notification.findMany({ where: { tenantId: a.tenant.id, type: "SCHEDULE_RUN" } });
    expect(notifRows).toHaveLength(0); // the only user is the actor -> excluded, zero rows

    // Re-run with nothing changed (same clock): same placement, same counts.
    const second = await runSchedule(a.db, session, ctx, { trigger: "manual", now: RUN_NOW });
    expect(second.entriesCreated).toBe(1);
    expect(second.stats.ordersScheduled).toBe(1);
    const entriesAfterSecond = await prisma.scheduleEntry.findMany({ where: { tenantId: a.tenant.id } });
    expect(entriesAfterSecond).toHaveLength(1);
    expect(entriesAfterSecond[0]!.plannedStartAt.getTime()).toBe(entry.plannedStartAt.getTime());
    expect(entriesAfterSecond[0]!.plannedEndAt.getTime()).toBe(entry.plannedEndAt.getTime());
    // Two runs recorded, both COMPLETED.
    const runs = await prisma.scheduleRun.findMany({ where: { tenantId: a.tenant.id } });
    expect(runs).toHaveLength(2);
    expect(runs.every((r) => r.status === "COMPLETED")).toBe(true);
  });

  it("is strictly tenant-isolated: tenant B never sees tenant A's scheduling rows via the scoped client", async () => {
    await seedOnePlant(b);
    await runSchedule(b.db, sessionFor(b), ctxFor(b), { trigger: "manual", now: RUN_NOW });

    const aEntries = await prisma.scheduleEntry.findMany({ where: { tenantId: a.tenant.id } });
    const bEntriesViaBScope = await b.db.scheduleEntry.findMany({});
    expect(bEntriesViaBScope.every((e) => e.tenantId === b.tenant.id)).toBe(true);
    expect(bEntriesViaBScope.some((e) => aEntries.some((ae) => ae.id === e.id))).toBe(false);

    const aRunsViaBScope = await b.db.scheduleRun.findMany({});
    expect(aRunsViaBScope.every((r) => r.tenantId === b.tenant.id)).toBe(true);
  });
});
