/**
 * Integration: `loadAnalytics()` (docs/M3_SPEC.md §5) against the seeded demo plant — cross-checks the live
 * "open orders at risk" count and the reused machine-utilisation calc against independent queries, and exercises
 * the on-time/throughput math against a real COMPLETED order (Decimal/Date round-tripping through Postgres).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { todayInTz } from "@/lib/dates";
import { loadAnalytics } from "@/lib/analytics/dashboard";
import { AT_RISK_DELIVERY_RISKS } from "@/lib/dashboard/queries";
import { OPEN_STATUSES } from "@/lib/orders/kpis";
import { loadBoardWindow } from "@/lib/scheduling/queries";
import { seedDemoData } from "@/lib/demo/seed-tenant";
import { createTenantFixture, dbAvailable, deleteTenant, disconnectDb, type TenantFixture } from "./helpers";

const available = await dbAvailable();

const NOW = new Date("2026-09-07T04:30:00.000Z"); // 10:00 IST
const TZ = "Asia/Kolkata";

describe.skipIf(!available)("loadAnalytics() (integration)", () => {
  let fx: TenantFixture;
  const today = todayInTz(TZ, NOW);
  const range = { from: "2026-08-08", to: today }; // trailing ~30 days ending "today"

  beforeAll(async () => {
    fx = await createTenantFixture({ slugPrefix: "analytics", timezone: TZ });
    await seedDemoData(fx.db, { id: fx.tenant.id, timezone: TZ, defaultCalendarId: fx.tenant.defaultCalendarId }, null, { variant: "acme", now: NOW });
  });

  afterAll(async () => {
    await deleteTenant(fx?.tenant.id);
    await disconnectDb();
  });

  it("open orders at risk matches an independent raw count, live and unaffected by the date range", async () => {
    const data = await loadAnalytics(fx.db, { range, tz: TZ, today });

    const raw = await prisma.order.count({
      where: { tenantId: fx.tenant.id, status: { in: [...OPEN_STATUSES] }, deliveryRisk: { in: [...AT_RISK_DELIVERY_RISKS] } },
    });
    expect(data.kpis.openOrdersAtRisk).toBe(raw);
  });

  it("machine utilisation reuses loadBoardWindow's own numbers verbatim (next 7 days from today)", async () => {
    const data = await loadAnalytics(fx.db, { range, tz: TZ, today });
    const board = await loadBoardWindow(fx.db, { from: today, days: 7, tz: TZ });

    const boardMachines = board.workCenters.flatMap((wc) => wc.machines);
    expect(data.machineUtilisation).toHaveLength(boardMachines.length);
    for (const row of data.machineUtilisation) {
      const boardMachine = boardMachines.find((m) => m.id === row.id);
      expect(boardMachine?.utilisationPercent).toBe(row.utilisationPercent);
    }
    // Sorted highest utilisation first.
    const pcts = data.machineUtilisation.map((m) => m.utilisationPercent);
    expect([...pcts].sort((a, b) => b - a)).toEqual(pcts);

    const expectedAvg =
      boardMachines.length > 0 ? Math.round(boardMachines.reduce((sum, m) => sum + m.utilisationPercent, 0) / boardMachines.length) : 0;
    expect(data.kpis.avgMachineUtilisation).toBe(expectedAvg);
  });

  it("throughput/on-time rate reflects a real COMPLETED order inside the range", async () => {
    const order = await fx.db.order.findFirst({ where: { status: { in: ["QUEUED", "IN_PROGRESS", "ON_HOLD"] } } });
    expect(order).not.toBeNull();

    // Complete it on time: completedAt before the end of its due date, inside the query range.
    const completedAt = new Date(`${range.from}T12:00:00.000Z`);
    await fx.db.order.update({
      where: { id: order!.id },
      data: { status: "COMPLETED", completedAt, dueDate: new Date(`${today}T00:00:00.000Z`) },
    });

    const data = await loadAnalytics(fx.db, { range, tz: TZ, today });
    expect(data.kpis.throughput).toBeGreaterThanOrEqual(1);
    expect(data.kpis.onTimeDeliveryRate).not.toBeNull();
    expect(data.kpis.onTimeDeliveryRate).toBeGreaterThanOrEqual(0);
    expect(data.kpis.onTimeDeliveryRate).toBeLessThanOrEqual(100);

    const totalThroughputByPriority = Object.values(data.throughputByPriority).reduce((a, b) => a + b, 0);
    expect(totalThroughputByPriority).toBe(data.kpis.throughput);

    const totalTrendCompleted = data.trend.reduce((sum, w) => sum + w.completed, 0);
    expect(totalTrendCompleted).toBe(data.kpis.throughput);
  });
});
