/**
 * Integration: `seedDemoData()` (docs/M1_SPEC.md §7) against prodplan_test.
 *  - expected row counts for the acme dataset;
 *  - stock balances: every material's stockOnHand equals the sum of its movements and every balanceAfter is the
 *    running balance (never negative);
 *  - order shape: 24 orders, 6 overdue / 8 due within 7 days / 4 completed (with completedAt) / 2 cancelled, every
 *    started order has ISSUE movements, default calendar is "Two shifts", holiday exception on the first Friday
 *    after D+7;
 *  - refuses on a non-empty plant (products or orders) without writing anything;
 *  - beta variant reuses SKU HB-200 and a customer name across tenants.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { DomainError } from "@/lib/errors";
import { addDays, todayInTz, weekdayOf } from "@/lib/dates";
import { requiredPerUnit, round3 } from "@/lib/bom";
import { demoDataset, SHARED_CUSTOMER_NAME, SHARED_SKU } from "@/lib/demo/demo-data";
import { DEMO_DATA_ENTITY_TYPE, DEMO_NOT_EMPTY_MESSAGE, demoHolidayDate, seedDemoData, type SeedDemoResult } from "@/lib/demo/seed-tenant";
import { createTenantFixture, dbAvailable, deleteTenant, disconnectDb, type TenantFixture } from "./helpers";

const available = await dbAvailable();

/** A fixed instant so the relative dates are deterministic within a run (10:00 IST). */
const NOW = new Date("2026-09-07T04:30:00.000Z");
const TZ = "Asia/Kolkata";

const ACME = demoDataset("acme");
const BETA = demoDataset("beta");

function toDto(fx: TenantFixture) {
  const { admin } = fx;
  return {
    id: admin.id,
    tenantId: admin.tenantId,
    email: admin.email,
    name: admin.name,
    role: admin.role,
    isActive: admin.isActive,
    mustChangePassword: admin.mustChangePassword,
    lastLoginAt: admin.lastLoginAt,
    createdAt: admin.createdAt,
    updatedAt: admin.updatedAt,
  };
}

function tenantArg(fx: TenantFixture) {
  return { id: fx.tenant.id, timezone: fx.tenant.timezone, defaultCalendarId: fx.tenant.defaultCalendarId };
}

describe.skipIf(!available)("seedDemoData (integration)", () => {
  let acme: TenantFixture;
  let beta: TenantFixture;
  let result: SeedDemoResult;
  const today = todayInTz(TZ, NOW);

  beforeAll(async () => {
    [acme, beta] = await Promise.all([
      createTenantFixture({ slugPrefix: "demo-acme", timezone: TZ }),
      createTenantFixture({ slugPrefix: "demo-beta", timezone: TZ }),
    ]);
    result = await seedDemoData(acme.db, tenantArg(acme), toDto(acme), { variant: "acme", now: NOW });
  });

  afterAll(async () => {
    await deleteTenant(acme?.tenant.id);
    await deleteTenant(beta?.tenant.id);
    await disconnectDb();
  });

  it("creates the expected number of rows for the acme plant", async () => {
    const where = { tenantId: acme.tenant.id };
    const [customers, workCenters, calendars, shifts, exceptions, machines, materials, products, bomItems, operations, orders, movements, downtime] =
      await Promise.all([
        prisma.customer.count({ where }),
        prisma.workCenter.count({ where }),
        prisma.shiftCalendar.count({ where }),
        prisma.shift.count({ where }),
        prisma.calendarException.count({ where }),
        prisma.machine.count({ where }),
        prisma.material.count({ where }),
        prisma.product.count({ where }),
        prisma.bomItem.count({ where }),
        prisma.productOperation.count({ where }),
        prisma.order.count({ where }),
        prisma.stockMovement.count({ where }),
        prisma.downtimeWindow.count({ where }),
      ]);

    expect(customers).toBe(6);
    expect(workCenters).toBe(3);
    // The fixture already had "General shift"; the seed adds "Two shifts" only.
    expect(calendars).toBe(2);
    expect(shifts).toBe(1 + 2);
    expect(exceptions).toBe(2);
    expect(machines).toBe(6);
    expect(materials).toBe(12);
    expect(products).toBe(5);
    expect(bomItems).toBe(ACME.products.reduce((n, p) => n + p.bom.length, 0));
    expect(operations).toBe(ACME.products.reduce((n, p) => n + p.routing.length, 0));
    expect(orders).toBe(24);
    expect(downtime).toBe(3);

    const startedOrders = ACME.orders.filter((o) => o.startedDaysAgo !== undefined);
    const expectedIssues = startedOrders.reduce((n, o) => n + (ACME.products.find((p) => p.sku === o.product)?.bom.length ?? 0), 0);
    expect(movements).toBe(12 * 2 + expectedIssues);

    expect(result.today).toBe(today);
    expect(result.counts).toMatchObject({ customers: 6, workCenters: 3, calendars: 1, shifts: 2, machines: 6, materials: 12, products: 5, orders: 24, downtimeWindows: 3 });
    expect(result.orderNumbers).toHaveLength(24);
    expect(result.orderNumbers[0]).toBe("SO-000001");
    expect(result.orderNumbers[23]).toBe("SO-000024");
  });

  it("stock balances equal the sum of movements and never go negative", async () => {
    const materials = await prisma.material.findMany({
      where: { tenantId: acme.tenant.id },
      include: { movements: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] } },
    });
    expect(materials).toHaveLength(12);
    const inProgress = new Set((await prisma.order.findMany({ where: { tenantId: acme.tenant.id, status: "IN_PROGRESS" } })).map((o) => o.orderNumber));
    for (const m of materials) {
      let running = 0;
      for (const mv of m.movements) {
        running = round3(running + Number(String(mv.quantity)));
        expect(running, `${m.code} balance after ${mv.reference}`).toBeGreaterThanOrEqual(0);
        expect(Number(String(mv.balanceAfter)), `${m.code} balanceAfter ${mv.reference}`).toBe(running);
        if (mv.type === "ISSUE") expect(Number(String(mv.quantity))).toBeLessThan(0);
        else expect(mv.type).toBe("RECEIPT");
      }
      expect(Number(String(m.stockOnHand)), `${m.code} stockOnHand`).toBe(running);
      const receipts = m.movements.filter((mv) => mv.type === "RECEIPT");
      expect(receipts).toHaveLength(2);
      // The ledger opens with a receipt, and the RECEIPT history precedes every ISSUE for an IN_PROGRESS order
      // (issues for long-completed orders may sit between the two deliveries — that is a real ledger).
      expect(m.movements[0]?.type).toBe("RECEIPT");
      const lastReceiptAt = Math.max(...receipts.map((r) => r.createdAt.getTime()));
      for (const mv of m.movements) {
        if (mv.type === "ISSUE" && mv.reference && inProgress.has(mv.reference)) {
          expect(mv.createdAt.getTime(), `${m.code}: ${mv.reference} issued before the receipt history`).toBeGreaterThan(lastReceiptAt);
        }
      }
    }
  });

  it("exactly three materials are at/below their reorder threshold, each used by a QUEUED order that is short", async () => {
    const materials = await prisma.material.findMany({ where: { tenantId: acme.tenant.id } });
    const below = materials.filter((m) => Number(String(m.stockOnHand)) <= Number(String(m.reorderThreshold)));
    expect(below.map((m) => m.code).sort()).toEqual(["HW-M10-NUT", "PT-RAL9005", "RM-SS304-SHT"]);

    const queued = await prisma.order.findMany({
      where: { tenantId: acme.tenant.id, status: "QUEUED" },
      include: { product: { include: { bomItems: true } } },
    });
    for (const m of below) {
      const onHand = Number(String(m.stockOnHand));
      const short = queued.some((o) => {
        const line = o.product.bomItems.find((b) => b.materialId === m.id);
        if (!line) return false;
        const required = round3(Number(String(o.quantity)) * requiredPerUnit(line.quantityPerUnit, line.scrapPercent));
        return required > onHand;
      });
      expect(short, `${m.code} should be short for at least one QUEUED order`).toBe(true);
    }
  });

  it("orders follow the spec shape (statuses, relative due dates, completedAt, ISSUEs for started orders)", async () => {
    const orders = await prisma.order.findMany({ where: { tenantId: acme.tenant.id }, orderBy: { orderNumber: "asc" } });
    const byStatus = (s: string) => orders.filter((o) => o.status === s);
    expect(byStatus("COMPLETED")).toHaveLength(4);
    expect(byStatus("CANCELLED")).toHaveLength(2);
    expect(byStatus("IN_PROGRESS")).toHaveLength(5);
    expect(byStatus("ON_HOLD")).toHaveLength(2);
    expect(byStatus("QUEUED")).toHaveLength(11);

    const iso = (d: Date) => d.toISOString().slice(0, 10);
    const open = orders.filter((o) => ["QUEUED", "IN_PROGRESS", "ON_HOLD"].includes(o.status));
    expect(open).toHaveLength(18);
    expect(open.filter((o) => iso(o.dueDate) < today)).toHaveLength(6);
    expect(open.filter((o) => iso(o.dueDate) >= today && iso(o.dueDate) <= addDays(today, 7))).toHaveLength(8);
    const dueDates = orders.map((o) => iso(o.dueDate));
    expect(Math.min(...dueDates.map((d) => d.localeCompare(addDays(today, -12))))).toBeGreaterThanOrEqual(0);
    expect(dueDates.every((d) => d <= addDays(today, 30))).toBe(true);

    for (const o of byStatus("COMPLETED")) {
      expect(o.completedAt).not.toBeNull();
      expect(iso(o.dueDate) < today).toBe(true);
    }
    for (const o of orders.filter((s) => s.status !== "COMPLETED")) expect(o.completedAt).toBeNull();
    for (const o of orders) {
      expect(o.createdAt.getTime()).toBeLessThan(NOW.getTime());
      expect(o.createdById).toBe(acme.admin.id);
    }

    const issues = await prisma.stockMovement.findMany({ where: { tenantId: acme.tenant.id, type: "ISSUE" } });
    const issuedRefs = new Set(issues.map((i) => i.reference));
    for (const o of [...byStatus("IN_PROGRESS"), ...byStatus("COMPLETED")]) {
      expect(issuedRefs.has(o.orderNumber), `${o.orderNumber} should have ISSUE movements`).toBe(true);
    }
    for (const o of [...byStatus("QUEUED"), ...byStatus("ON_HOLD"), ...byStatus("CANCELLED")]) {
      expect(issuedRefs.has(o.orderNumber), `${o.orderNumber} must not have ISSUE movements`).toBe(false);
    }
  });

  it("sets 'Two shifts' as the default calendar, keeps 'General shift', and adds the holiday exception", async () => {
    const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: acme.tenant.id }, include: { defaultCalendar: { include: { shifts: true } } } });
    expect(tenant.defaultCalendar?.name).toBe("Two shifts");
    expect(tenant.defaultCalendarId).toBe(result.defaultCalendarId);
    expect(tenant.defaultCalendar?.shifts.map((s) => `${s.startTime}-${s.endTime}/${s.breakMinutes}`).sort()).toEqual(["06:00-14:00/30", "14:00-22:00/30"]);
    expect(tenant.orderSeq).toBe(24);

    const general = await prisma.shiftCalendar.findFirst({ where: { tenantId: acme.tenant.id, name: "General shift" } });
    expect(general?.id).toBe(acme.calendar.id);

    const holiday = demoHolidayDate(today);
    expect(weekdayOf(holiday)).toBe(5);
    expect(holiday > addDays(today, 7)).toBe(true);
    expect(holiday <= addDays(today, 14)).toBe(true);
    const exceptions = await prisma.calendarException.findMany({ where: { tenantId: acme.tenant.id } });
    expect(exceptions.map((e) => e.date.toISOString().slice(0, 10))).toEqual([holiday, holiday]);
    expect(exceptions.every((e) => !e.isWorking)).toBe(true);
    expect(new Set(exceptions.map((e) => e.calendarId))).toEqual(new Set([acme.calendar.id, result.defaultCalendarId]));
  });

  it("machines: 6 with one in MAINTENANCE; downtime = D+2 maintenance, a past breakdown and one active window", async () => {
    const machines = await prisma.machine.findMany({ where: { tenantId: acme.tenant.id }, include: { workCenter: true, downtime: true } });
    expect(machines.filter((m) => m.status === "MAINTENANCE").map((m) => m.code)).toEqual(["CNC-03"]);
    expect(machines.filter((m) => m.workCenter.code === "CNC")).toHaveLength(3);
    for (const m of machines) {
      expect(m.efficiencyPercent).toBeGreaterThanOrEqual(85);
      expect(m.efficiencyPercent).toBeLessThanOrEqual(100);
    }
    const windows = machines.flatMap((m) => m.downtime.map((d) => ({ ...d, code: m.code })));
    expect(windows).toHaveLength(3);
    const maintenance = windows.find((w) => w.type === "MAINTENANCE");
    expect(maintenance?.startsAt.toISOString()).toBe(`${addDays(today, 2)}T02:30:00.000Z`); // 08:00 IST
    expect(maintenance?.endsAt.toISOString()).toBe(`${addDays(today, 2)}T06:30:00.000Z`); // 12:00 IST
    const breakdown = windows.find((w) => w.type === "BREAKDOWN");
    expect(breakdown?.endsAt.getTime()).toBeLessThan(NOW.getTime());
    const active = windows.filter((w) => w.startsAt <= NOW && NOW < w.endsAt);
    expect(active.map((w) => w.code)).toEqual(["ASM-02"]);
  });

  it("writes an audit row for everything, with entity timestamps and one IMPORT summary", async () => {
    const rows = await prisma.auditLog.findMany({ where: { tenantId: acme.tenant.id } });
    const byType = (t: string, a?: string) => rows.filter((r) => r.entityType === t && (!a || r.action === a));
    expect(byType("Customer", "CREATE")).toHaveLength(6);
    expect(byType("WorkCenter", "CREATE")).toHaveLength(3);
    expect(byType("ShiftCalendar", "CREATE")).toHaveLength(1);
    expect(byType("Shift", "CREATE")).toHaveLength(2);
    expect(byType("CalendarException", "CREATE")).toHaveLength(2);
    expect(byType("Machine", "CREATE")).toHaveLength(6);
    expect(byType("Material", "CREATE")).toHaveLength(12);
    expect(byType("Product", "CREATE")).toHaveLength(5);
    expect(byType("BomItem", "CREATE")).toHaveLength(result.counts.bomItems);
    expect(byType("ProductOperation", "CREATE")).toHaveLength(result.counts.operations);
    expect(byType("Order", "CREATE")).toHaveLength(24);
    // 5 in progress (1 change) + 4 completed (2) + 2 on hold (1) + 2 cancelled (1)
    expect(byType("Order", "STATUS_CHANGE")).toHaveLength(5 + 8 + 2 + 2);
    expect(byType("StockMovement", "CREATE")).toHaveLength(result.counts.stockMovements);
    expect(byType("DowntimeWindow", "CREATE")).toHaveLength(3);
    expect(byType("Tenant", "UPDATE")).toHaveLength(1);
    const imports = byType(DEMO_DATA_ENTITY_TYPE, "IMPORT");
    expect(imports).toHaveLength(1);
    expect(imports[0].summary).toContain("24 orders");
    expect(imports[0].entityId).toBe(acme.tenant.id);
    expect(imports[0].entityLabel).toContain("24 orders");
    expect(imports[0].actorUserId).toBe(acme.admin.id);
    expect(rows).toHaveLength(result.counts.auditRows);
    for (const r of rows) {
      expect(r.summary.length).toBeGreaterThan(0);
      expect(r.actorUserId).toBe(acme.admin.id);
    }
    // Story-like timestamps: not everything happened "just now".
    const distinctDays = new Set(rows.map((r) => r.createdAt.toISOString().slice(0, 10)));
    expect(distinctDays.size).toBeGreaterThan(10);
    const holds = rows.filter((r) => r.action === "STATUS_CHANGE" && r.summary.includes("ON_HOLD"));
    expect(holds.every((r) => r.summary.includes("—"))).toBe(true);
  });

  it("refuses to load into a plant that already has orders or products, without writing anything", async () => {
    const before = await prisma.auditLog.count({ where: { tenantId: acme.tenant.id } });
    await expect(seedDemoData(acme.db, tenantArg(acme), toDto(acme), { now: NOW })).rejects.toThrow(DEMO_NOT_EMPTY_MESSAGE);
    await expect(seedDemoData(acme.db, tenantArg(acme), toDto(acme), { now: NOW })).rejects.toBeInstanceOf(DomainError);
    expect(await prisma.auditLog.count({ where: { tenantId: acme.tenant.id } })).toBe(before);
    expect(await prisma.order.count({ where: { tenantId: acme.tenant.id } })).toBe(24);

    // Products alone are enough to refuse.
    const product = await prisma.product.create({ data: { tenantId: beta.tenant.id, sku: "ONLY-ONE", name: "Existing product" } });
    await expect(seedDemoData(beta.db, tenantArg(beta), toDto(beta), { variant: "beta", now: NOW })).rejects.toThrow(DEMO_NOT_EMPTY_MESSAGE);
    expect(await prisma.customer.count({ where: { tenantId: beta.tenant.id } })).toBe(0);
    await prisma.product.delete({ where: { id: product.id } });
  });

  it("beta variant: 3 orders, shares SKU HB-200 and a customer name with acme, reuses existing master data by key", async () => {
    // Pre-existing rows with the same business keys are reused, not duplicated.
    const existingWc = await prisma.workCenter.create({ data: { tenantId: beta.tenant.id, code: "FAB", name: "Fab (pre-existing)" } });
    const existingCustomer = await prisma.customer.create({ data: { tenantId: beta.tenant.id, name: SHARED_CUSTOMER_NAME.toUpperCase() } });

    const betaResult = await seedDemoData(beta.db, tenantArg(beta), null, { variant: "beta", now: NOW });
    expect(betaResult.counts.orders).toBe(3);
    expect(betaResult.counts.customers).toBe(BETA.customers.length - 1);
    expect(betaResult.counts.workCenters).toBe(BETA.workCenters.length - 1);

    const where = { tenantId: beta.tenant.id };
    expect(await prisma.order.count({ where })).toBe(3);
    expect(await prisma.customer.count({ where })).toBe(BETA.customers.length);
    expect(await prisma.workCenter.count({ where })).toBe(BETA.workCenters.length);
    const ordersOnReused = await prisma.order.count({ where: { ...where, customerId: existingCustomer.id } });
    expect(ordersOnReused).toBe(1);
    expect(await prisma.machine.count({ where: { ...where, workCenterId: existingWc.id } })).toBe(1);

    const hb = await prisma.product.findMany({ where: { sku: SHARED_SKU, tenantId: { in: [acme.tenant.id, beta.tenant.id] } } });
    expect(hb.map((p) => p.tenantId).sort()).toEqual([acme.tenant.id, beta.tenant.id].sort());
    const pgw = await prisma.customer.findMany({
      where: { name: { equals: SHARED_CUSTOMER_NAME, mode: "insensitive" }, tenantId: { in: [acme.tenant.id, beta.tenant.id] } },
    });
    expect(pgw).toHaveLength(2);

    // actor = null → attributed to the plant's ADMIN.
    const imports = await prisma.auditLog.findMany({ where: { ...where, action: "IMPORT" } });
    expect(imports).toHaveLength(1);
    expect(imports[0].actorUserId).toBe(beta.admin.id);

    // Balances hold for the beta plant too.
    const materials = await prisma.material.findMany({ where, include: { movements: true } });
    for (const m of materials) {
      const sum = round3(m.movements.reduce((n, mv) => n + Number(String(mv.quantity)), 0));
      expect(Number(String(m.stockOnHand))).toBe(sum);
    }
  });
});
