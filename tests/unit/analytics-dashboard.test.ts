/**
 * Unit: `loadAnalytics()` aggregation logic (docs/M3_SPEC.md §5) — on-time delivery rate, weekly trend buckets,
 * throughput-by-priority and utilisation averaging, against a fake tenant client and a mocked `loadBoardWindow()`
 * (so the reused utilisation formula itself is exercised by `queries.ts`'s own tests, not duplicated here).
 */
import { describe, expect, it, vi } from "vitest";
import type { TenantDb } from "@/lib/db";
import type { BoardWindowDTO } from "@/lib/scheduling/queries";

const loadBoardWindowMock = vi.fn<(...args: unknown[]) => Promise<BoardWindowDTO>>();

vi.mock("@/lib/scheduling/queries", () => ({
  loadBoardWindow: (...args: unknown[]) => loadBoardWindowMock(...args),
}));

const { loadAnalytics } = await import("@/lib/analytics/dashboard");

type FakeOrderRow = { completedAt: Date | null; dueDate: Date; priority: "LOW" | "NORMAL" | "HIGH" | "URGENT" };

function fakeDb(orders: FakeOrderRow[], openOrdersAtRisk: number): TenantDb {
  const findMany = vi.fn(async () => orders);
  const count = vi.fn(async () => openOrdersAtRisk);
  return { order: { findMany, count } } as unknown as TenantDb;
}

function boardWindow(machines: Array<{ id: string; code: string; utilisationPercent: number }>): BoardWindowDTO {
  return {
    from: "2026-09-14",
    days: 7,
    dirty: false,
    lastRunAt: null,
    workCenters: [
      {
        id: "wc1",
        code: "CNC",
        name: "CNC",
        machines: machines.map((m) => ({
          id: m.id,
          code: m.code,
          name: m.code,
          workCenterId: "wc1",
          status: "ACTIVE",
          calendarId: "cal1",
          utilisationPercent: m.utilisationPercent,
          entries: [],
          downtime: [],
          shifts: [],
        })),
      },
    ],
  };
}

const RANGE = { from: "2026-08-31", to: "2026-09-13" }; // two full Monday-start ISO weeks

describe("loadAnalytics()", () => {
  it("computes on-time rate, weekly trend and throughput-by-priority from one batched order read", async () => {
    loadBoardWindowMock.mockResolvedValueOnce(
      boardWindow([
        { id: "m1", code: "CNC-01", utilisationPercent: 80 },
        { id: "m2", code: "CNC-02", utilisationPercent: 40 },
      ]),
    );
    const db = fakeDb(
      [
        // Week of Aug 31: on time (due end Sep 05, completed Sep 02).
        { completedAt: new Date("2026-09-02T10:00:00.000Z"), dueDate: new Date("2026-09-05T00:00:00.000Z"), priority: "URGENT" },
        // Week of Aug 31: late (due end Sep 01, completed Sep 03).
        { completedAt: new Date("2026-09-03T10:00:00.000Z"), dueDate: new Date("2026-09-01T00:00:00.000Z"), priority: "HIGH" },
        // Week of Sep 07: on time.
        { completedAt: new Date("2026-09-09T10:00:00.000Z"), dueDate: new Date("2026-09-10T00:00:00.000Z"), priority: "NORMAL" },
      ],
      5,
    );

    const data = await loadAnalytics(db, { range: RANGE, tz: "UTC", today: "2026-09-14" });

    expect(data.kpis.throughput).toBe(3);
    expect(data.kpis.onTimeDeliveryRate).toBe(67); // 2/3 rounded
    expect(data.kpis.openOrdersAtRisk).toBe(5);
    expect(data.kpis.avgMachineUtilisation).toBe(60); // mean(80, 40)

    expect(data.trend).toEqual([
      { weekStart: "2026-08-31", completed: 2, onTime: 1, onTimePercent: 50 },
      { weekStart: "2026-09-07", completed: 1, onTime: 1, onTimePercent: 100 },
    ]);

    expect(data.throughputByPriority).toEqual({ URGENT: 1, HIGH: 1, NORMAL: 1, LOW: 0 });

    expect(data.machineUtilisation).toEqual([
      { id: "m1", code: "CNC-01", name: "CNC-01", workCenterId: "wc1", workCenterCode: "CNC", utilisationPercent: 80 },
      { id: "m2", code: "CNC-02", name: "CNC-02", workCenterId: "wc1", workCenterCode: "CNC", utilisationPercent: 40 },
    ]);

    expect(loadBoardWindowMock).toHaveBeenCalledWith(db, { from: "2026-09-14", days: 7, tz: "UTC" });
  });

  it("never divides by zero: no completions → null rate, null week percentages, 0 avg utilisation", async () => {
    loadBoardWindowMock.mockResolvedValueOnce(boardWindow([]));
    const db = fakeDb([], 0);

    const data = await loadAnalytics(db, { range: RANGE, tz: "UTC", today: "2026-09-14" });

    expect(data.kpis.throughput).toBe(0);
    expect(data.kpis.onTimeDeliveryRate).toBeNull();
    expect(data.kpis.avgMachineUtilisation).toBe(0);
    expect(data.trend).toEqual([
      { weekStart: "2026-08-31", completed: 0, onTime: 0, onTimePercent: null },
      { weekStart: "2026-09-07", completed: 0, onTime: 0, onTimePercent: null },
    ]);
    expect(data.throughputByPriority).toEqual({ URGENT: 0, HIGH: 0, NORMAL: 0, LOW: 0 });
    expect(data.machineUtilisation).toEqual([]);
  });

  it("a boundary completion exactly at the due-date end counts as on time", async () => {
    loadBoardWindowMock.mockResolvedValueOnce(boardWindow([{ id: "m1", code: "CNC-01", utilisationPercent: 10 }]));
    // Due Sep 05 → end of day is Sep 06T00:00:00.000Z in UTC; completing at exactly that instant is on time.
    const db = fakeDb([{ completedAt: new Date("2026-09-06T00:00:00.000Z"), dueDate: new Date("2026-09-05T00:00:00.000Z"), priority: "LOW" }], 0);

    const data = await loadAnalytics(db, { range: RANGE, tz: "UTC", today: "2026-09-14" });

    expect(data.kpis.onTimeDeliveryRate).toBe(100);
  });
});
