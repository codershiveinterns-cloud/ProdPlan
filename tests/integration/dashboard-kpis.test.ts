/**
 * Integration: dashboard data (docs/M1_SPEC.md §6.6) against the seeded demo plant.
 *  - KPI numbers from `getDashboardKpis()` match the demo dataset AND independent raw counts;
 *  - `loadDashboard()` lists: 10 open orders by due date (overdue first), machines by work center then code with
 *    the active downtime, activity limited to 10 and filtered per `audit:read-all`;
 *  - first-run: an empty plant reports 0 orders and the checklist done-checks reflect the counts.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { addDays, todayInTz } from "@/lib/dates";
import { getDashboardKpis, loadDashboard, setupSteps, DASHBOARD_LIST_LIMIT } from "@/lib/dashboard/queries";
import { seedDemoData } from "@/lib/demo/seed-tenant";
import { isBelowReorder } from "@/lib/orders/kpis";
import { createTenantFixture, dbAvailable, deleteTenant, disconnectDb, type TenantFixture } from "./helpers";

const available = await dbAvailable();

const NOW = new Date("2026-09-07T04:30:00.000Z"); // 10:00 IST
const TZ = "Asia/Kolkata";

describe.skipIf(!available)("dashboard queries (integration)", () => {
  let fx: TenantFixture;
  let empty: TenantFixture;
  const today = todayInTz(TZ, NOW);

  beforeAll(async () => {
    [fx, empty] = await Promise.all([
      createTenantFixture({ slugPrefix: "dash", timezone: TZ }),
      createTenantFixture({ slugPrefix: "dash-empty", timezone: TZ }),
    ]);
    await seedDemoData(fx.db, { id: fx.tenant.id, timezone: TZ, defaultCalendarId: fx.tenant.defaultCalendarId }, null, { variant: "acme", now: NOW });
  });

  afterAll(async () => {
    await deleteTenant(fx?.tenant.id);
    await deleteTenant(empty?.tenant.id);
    await disconnectDb();
  });

  it("KPI numbers match the demo plant and independent raw counts", async () => {
    const { kpis, ordersTotal } = await getDashboardKpis(fx.db, { today, now: NOW });

    expect(ordersTotal).toBe(24);
    expect(kpis.orders).toEqual({ open: 18, overdue: 6, dueSoon: 8, inProgress: 5 });
    expect(kpis.machines).toEqual({ total: 6, active: 4, maintenance: 1, inactive: 0, downNow: 1 });
    expect(kpis.materialsBelowReorder).toBe(3);

    // Independent cross-check with raw queries (no shared helpers).
    const orders = await prisma.order.findMany({ where: { tenantId: fx.tenant.id } });
    const iso = (d: Date) => d.toISOString().slice(0, 10);
    const open = orders.filter((o) => o.status === "QUEUED" || o.status === "IN_PROGRESS" || o.status === "ON_HOLD");
    expect(open).toHaveLength(kpis.orders.open);
    expect(open.filter((o) => iso(o.dueDate) < today)).toHaveLength(kpis.orders.overdue);
    expect(open.filter((o) => iso(o.dueDate) >= today && iso(o.dueDate) <= addDays(today, 7))).toHaveLength(kpis.orders.dueSoon);
    expect(orders.filter((o) => o.status === "IN_PROGRESS")).toHaveLength(kpis.orders.inProgress);

    const machines = await prisma.machine.findMany({ where: { tenantId: fx.tenant.id }, include: { downtime: true } });
    const isDown = (m: (typeof machines)[number]) => m.downtime.some((w) => w.startsAt <= NOW && NOW < w.endsAt);
    expect(machines.filter((m) => m.status === "ACTIVE" && !isDown(m))).toHaveLength(kpis.machines.active);
    expect(machines.filter((m) => m.status === "ACTIVE" && isDown(m))).toHaveLength(kpis.machines.downNow);
    expect(machines.filter((m) => m.status === "MAINTENANCE")).toHaveLength(kpis.machines.maintenance);

    const materials = await prisma.material.findMany({ where: { tenantId: fx.tenant.id, isActive: true } });
    expect(materials.filter(isBelowReorder)).toHaveLength(kpis.materialsBelowReorder);
  });

  it("orders by due date: 10 open orders, ascending, overdue first; tile hrefs follow the list URL contract", async () => {
    const data = await loadDashboard(fx.db, { today, now: NOW, includeSensitiveAudit: true });
    expect(data.today).toBe(today);
    expect(data.ordersByDue).toHaveLength(DASHBOARD_LIST_LIMIT);
    const dues = data.ordersByDue.map((o) => o.dueDate);
    expect([...dues].sort()).toEqual(dues);
    expect(dues[0] < today).toBe(true);
    expect(data.ordersByDue.filter((o) => o.dueDate < today)).toHaveLength(6);
    for (const o of data.ordersByDue) {
      expect(["QUEUED", "IN_PROGRESS", "ON_HOLD"]).toContain(o.status);
      expect(o.customerName.length).toBeGreaterThan(0);
      expect(o.productSku.length).toBeGreaterThan(0);
      expect(typeof o.quantity).toBe("number");
      expect(o.dueDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
    expect(data.totals.orders).toBe(24);
    expect(data.totals.machines).toBe(6);
    // Not first-run → checklist counts are not fetched.
    expect(data.totals.products).toBe(-1);

    expect(data.hrefs.open).toBe("/orders?status=open");
    expect(data.hrefs.overdue).toBe(`/orders?status=open&dueTo=${addDays(today, -1)}`);
    expect(data.hrefs.dueSoon).toBe(`/orders?status=open&dueFrom=${today}&dueTo=${addDays(today, 7)}`);
    expect(data.hrefs.inProgress).toBe("/orders?status=IN_PROGRESS");
    expect(data.hrefs.materialsBelowReorder).toBe("/materials?belowThreshold=1");
    expect(data.hrefs.machines).toBe("/machines");
  });

  it("machines: by work center then code, with the window covering now", async () => {
    const data = await loadDashboard(fx.db, { today, now: NOW, includeSensitiveAudit: true });
    expect(data.machines.map((m) => `${m.workCenterCode}/${m.code}`)).toEqual([
      "ASM/ASM-01",
      "ASM/ASM-02",
      "CNC/CNC-01",
      "CNC/CNC-02",
      "CNC/CNC-03",
      "PNT/PNT-01",
    ]);
    const down = data.machines.filter((m) => m.activeDowntime);
    expect(down.map((m) => m.code)).toEqual(["ASM-02"]);
    expect(down[0].activeDowntime?.type).toBe("OTHER");
    expect(down[0].activeDowntime?.endsAt.getTime()).toBeGreaterThan(NOW.getTime());
    expect(data.machines.find((m) => m.code === "CNC-03")?.status).toBe("MAINTENANCE");
  });

  it("recent activity: 10 rows, newest first, User/Tenant rows hidden without audit:read-all", async () => {
    const admin = await loadDashboard(fx.db, { today, now: NOW, includeSensitiveAudit: true });
    expect(admin.activity).toHaveLength(DASHBOARD_LIST_LIMIT);
    const times = admin.activity.map((a) => a.createdAt);
    expect([...times].sort().reverse()).toEqual(times);
    // seedDemoData() runs the schedule and puts two operations IN_PROGRESS right after loading the demo plant
    // (docs/M2_SPEC.md §6); those STATUS_CHANGE rows are written after — and so are newer than — the IMPORT row.
    expect(admin.activity[0]).toMatchObject({ entityType: "ScheduleEntry", action: "STATUS_CHANGE" });
    expect(typeof admin.activity[0].createdAt).toBe("string");

    // A fresh User row (e.g. an invite) shows for admins only; VIEWER/PLANNER/SUPERVISOR never see User/Tenant rows.
    await prisma.auditLog.create({
      data: {
        tenantId: fx.tenant.id,
        actorUserId: fx.admin.id,
        actorName: fx.admin.name,
        entityType: "User",
        entityId: "user-x",
        entityLabel: "new@example.test",
        action: "CREATE",
        summary: "Invited user new@example.test as Planner",
        changedFields: [],
        createdAt: new Date(Date.now() + 1000),
      },
    });
    const adminAfter = await loadDashboard(fx.db, { today, now: NOW, includeSensitiveAudit: true });
    expect(adminAfter.activity[0]).toMatchObject({ entityType: "User", action: "CREATE" });
    expect(adminAfter.activity[1]).toMatchObject({ entityType: "ScheduleEntry", action: "STATUS_CHANGE" });

    const viewer = await loadDashboard(fx.db, { today, now: NOW, includeSensitiveAudit: false });
    expect(viewer.activity).toHaveLength(DASHBOARD_LIST_LIMIT);
    expect(viewer.activity[0]).toMatchObject({ entityType: "ScheduleEntry", action: "STATUS_CHANGE" });
    expect(viewer.activity.some((a) => a.entityType === "Tenant" || a.entityType === "User")).toBe(false);
    const sensitive = await prisma.auditLog.count({ where: { tenantId: fx.tenant.id, entityType: { in: ["Tenant", "User"] } } });
    expect(sensitive).toBeGreaterThanOrEqual(2); // the seed's default-calendar Tenant row + the invite above
  });

  it("first-run: an empty plant reports 0 orders and checklist done-checks from the counts", async () => {
    const data = await loadDashboard(empty.db, { today, now: NOW, includeSensitiveAudit: false });
    expect(data.totals).toEqual({ orders: 0, products: 0, workCenters: 0, calendars: 1, machines: 0, materials: 0 });
    expect(data.kpis.orders).toEqual({ open: 0, overdue: 0, dueSoon: 0, inProgress: 0 });
    expect(data.kpis.machines).toEqual({ total: 0, active: 0, maintenance: 0, inactive: 0, downNow: 0 });
    expect(data.kpis.materialsBelowReorder).toBe(0);
    expect(data.ordersByDue).toEqual([]);
    expect(data.machines).toEqual([]);

    const steps = setupSteps(data.totals, data.scheduleHasRun);
    expect(steps.map((s) => s.key)).toEqual(["workCenters", "calendar", "machines", "materials", "products", "orders", "schedule"]);
    expect(steps.map((s) => s.done)).toEqual([false, true, false, false, false, false, false]);

    await prisma.workCenter.create({ data: { tenantId: empty.tenant.id, code: "WC1", name: "First" } });
    const after = await loadDashboard(empty.db, { today, now: NOW, includeSensitiveAudit: false });
    expect(setupSteps(after.totals)[0].done).toBe(true);
  });
});
