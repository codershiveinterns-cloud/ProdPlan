/**
 * Integration (docs/M2_SPEC.md §3, §4, §7): move -> lock -> re-run keeps the moved entry in place while other
 * entries re-flow; a floor start -> complete transition rolls the order status up, writes an audit row, and
 * notifies other users (never the actor).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AuditCtx } from "@/lib/audit";
import { toUserDTO } from "@/lib/auth/user-dto";
import type { Session } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { moveEntry } from "@/lib/scheduling/move";
import { applyOperationTransition } from "@/lib/scheduling/operation-status";
import { runSchedule } from "@/lib/scheduling/run";
import { createTenantFixture, dbAvailable, deleteTenant, disconnectDb, type TenantFixture } from "./helpers";

const available = await dbAvailable();

function sessionFor(f: TenantFixture, admin = f.admin): Session {
  return {
    user: toUserDTO(admin),
    tenant: { id: f.tenant.id, name: f.tenant.name, slug: f.tenant.slug, timezone: f.tenant.timezone, defaultCalendarId: f.tenant.defaultCalendarId },
  };
}

function ctxFor(f: TenantFixture, admin = f.admin): AuditCtx {
  return { actor: { id: admin.id, email: admin.email, name: admin.name, tenantId: f.tenant.id } };
}

const RUN_NOW = new Date("2026-09-14T03:30:00.000Z"); // Monday 09:00 IST

describe.skipIf(!available)("move / floor flow (integration)", () => {
  let f: TenantFixture;

  beforeAll(async () => {
    f = await createTenantFixture({ slugPrefix: "sched-floor" });
  });

  afterAll(async () => {
    await deleteTenant(f?.tenant.id);
    await disconnectDb();
  });

  it("move -> lock -> re-run keeps the moved entry locked in place while other orders re-flow around it", async () => {
    const wc = await prisma.workCenter.create({ data: { tenantId: f.tenant.id, code: "WC1", name: "Work centre 1" } });
    const m1 = await prisma.machine.create({ data: { tenantId: f.tenant.id, workCenterId: wc.id, calendarId: f.calendar.id, code: "M-1", name: "Machine 1" } });
    const m2 = await prisma.machine.create({ data: { tenantId: f.tenant.id, workCenterId: wc.id, calendarId: f.calendar.id, code: "M-2", name: "Machine 2" } });
    const product = await prisma.product.create({ data: { tenantId: f.tenant.id, sku: "SKU-M", name: "Mover", unit: "pcs" } });
    await prisma.productOperation.create({ data: { tenantId: f.tenant.id, productId: product.id, sequence: 10, workCenterId: wc.id, setupMinutes: 15, runMinutesPerUnit: 2 } });
    const customer = await prisma.customer.create({ data: { tenantId: f.tenant.id, name: "Acme" } });
    const order = await prisma.order.create({
      data: { tenantId: f.tenant.id, orderNumber: "SO-100001", customerId: customer.id, productId: product.id, quantity: 5, dueDate: new Date("2026-12-01T00:00:00.000Z"), status: "QUEUED", createdById: f.admin.id },
    });

    const session = sessionFor(f);
    const ctx = ctxFor(f);
    await runSchedule(f.db, session, ctx, { trigger: "manual", now: RUN_NOW });
    const [entry] = await prisma.scheduleEntry.findMany({ where: { orderId: order.id } });
    expect(entry).toBeDefined();

    // Drag it onto the OTHER machine, a bit later.
    const target = entry!.machineId === m1.id ? m2 : m1;
    const dropAt = new Date(RUN_NOW.getTime() + 2 * 60 * 60_000); // +2h
    const moveResult = await moveEntry(f.db, session, ctx, { entryId: entry!.id, machineId: target.id, plannedStartAt: dropAt });
    expect(moveResult.machineId).toBe(target.id);

    const moved = await prisma.scheduleEntry.findUniqueOrThrow({ where: { id: entry!.id } });
    expect(moved.locked).toBe(true);
    expect(moved.lockedById).toBe(f.admin.id);
    expect(moved.machineId).toBe(target.id);

    // A second order competing for the same work center: a fresh run must not move the locked entry.
    await prisma.order.create({
      data: { tenantId: f.tenant.id, orderNumber: "SO-100002", customerId: customer.id, productId: product.id, quantity: 5, dueDate: new Date("2026-12-05T00:00:00.000Z"), status: "QUEUED", createdById: f.admin.id },
    });
    await runSchedule(f.db, session, ctx, { trigger: "manual", now: RUN_NOW });

    const stillLocked = await prisma.scheduleEntry.findUniqueOrThrow({ where: { id: entry!.id } });
    expect(stillLocked.locked).toBe(true);
    expect(stillLocked.machineId).toBe(target.id);
    expect(stillLocked.plannedStartAt.getTime()).toBe(moved.plannedStartAt.getTime());
  });

  it("floor start -> complete rolls up the order status, writes an audit row, and notifies other users (not the actor)", async () => {
    const wc = await prisma.workCenter.create({ data: { tenantId: f.tenant.id, code: "WC2", name: "Work centre 2" } });
    await prisma.machine.create({ data: { tenantId: f.tenant.id, workCenterId: wc.id, calendarId: f.calendar.id, code: "F-1", name: "Floor machine" } });
    const product = await prisma.product.create({ data: { tenantId: f.tenant.id, sku: "SKU-F", name: "Floored", unit: "pcs" } });
    await prisma.productOperation.create({ data: { tenantId: f.tenant.id, productId: product.id, sequence: 10, workCenterId: wc.id, setupMinutes: 10, runMinutesPerUnit: 1 } });
    const customer = await prisma.customer.create({ data: { tenantId: f.tenant.id, name: "Acme Floor" } });
    const order = await prisma.order.create({
      data: { tenantId: f.tenant.id, orderNumber: "SO-200001", customerId: customer.id, productId: product.id, quantity: 5, dueDate: new Date("2026-12-01T00:00:00.000Z"), status: "QUEUED", createdById: f.admin.id },
    });

    const planner = await prisma.user.create({ data: { tenantId: f.tenant.id, email: `planner-${Date.now()}@${f.tenant.slug}.test`, name: "Priya Planner", passwordHash: "x", role: "PLANNER" } });
    const session = sessionFor(f, planner);
    const ctx = ctxFor(f, planner);

    await runSchedule(f.db, session, ctx, { trigger: "manual", now: RUN_NOW });
    const entry = await prisma.scheduleEntry.findFirstOrThrow({ where: { orderId: order.id } });

    const startResult = await f.db.$transaction(async (tx) => applyOperationTransition(tx, session, ctx, { entryId: entry.id, to: "IN_PROGRESS", now: RUN_NOW }));
    expect(startResult.to).toBe("IN_PROGRESS");
    expect(startResult.orderStatus).toEqual({ from: "QUEUED", to: "IN_PROGRESS" });

    const completeAt = new Date(RUN_NOW.getTime() + 30 * 60_000);
    const completeResult = await f.db.$transaction(async (tx) => applyOperationTransition(tx, session, ctx, { entryId: entry.id, to: "COMPLETED", quantityDone: 5, now: completeAt }));
    expect(completeResult.to).toBe("COMPLETED");
    expect(completeResult.orderStatus).toEqual({ from: "IN_PROGRESS", to: "COMPLETED" });

    const finalOrder = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(finalOrder.status).toBe("COMPLETED");
    expect(finalOrder.completedAt).not.toBeNull();

    const auditRows = await prisma.auditLog.findMany({ where: { tenantId: f.tenant.id, entityType: "ScheduleEntry", entityId: entry.id }, orderBy: { createdAt: "asc" } });
    expect(auditRows.length).toBeGreaterThanOrEqual(2);
    expect(auditRows.every((r) => r.actorUserId === planner.id)).toBe(true);

    // The planner (actor) triggered these changes; the admin (a different PLANNER-visible role) should be notified,
    // the planner themself should not.
    const notifsForAdmin = await prisma.notification.findMany({ where: { tenantId: f.tenant.id, userId: f.admin.id } });
    expect(notifsForAdmin.length).toBeGreaterThan(0);
    const notifsForActor = await prisma.notification.findMany({ where: { tenantId: f.tenant.id, userId: planner.id } });
    expect(notifsForActor).toHaveLength(0);
  });
});
