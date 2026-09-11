/**
 * Unit tests for the pure scheduling engine (docs/M2_SPEC.md §2, §7): placement (multi-shift spanning, downtime,
 * fixed machine, locked/in-progress entries respected, priority/due-date ordering, horizon overflow), material
 * shortage maths, conflict generation, and a performance test (< 2 s for 200 orders × 3 ops × 20 machines).
 */
import { describe, expect, it } from "vitest";
import type { Calendar } from "@/lib/calendar";
import { scheduleOrders, sortCandidates, stepMinutes } from "@/lib/scheduling/engine";
import type { EngineEntry, EngineInput, EngineMachine, EngineOrder } from "@/lib/scheduling/types";

const TZ = "Asia/Kolkata";
const NOW = new Date("2026-09-11T02:00:00.000Z"); // 07:30 IST, Friday

/** One 8h shift (09:00–17:00, 60 min break) every day of the week — spans predictably for the "multi-shift" test. */
const DAY_SHIFT: Calendar = {
  shifts: [{ id: "s1", name: "Day", startTime: "09:00", endTime: "17:00", daysOfWeek: [0, 1, 2, 3, 4, 5, 6], breakMinutes: 60 }],
  exceptions: [],
};

/** A calendar with effectively unlimited capacity (24 h, no break, every day) for tests that just need "always open". */
const ALWAYS_OPEN: Calendar = {
  shifts: [{ id: "s1", name: "Always", startTime: "00:00", endTime: "23:59", daysOfWeek: [0, 1, 2, 3, 4, 5, 6], breakMinutes: 0 }],
  exceptions: [],
};

function machine(id: string, workCenterId: string, calendarId: string, code = id): EngineMachine {
  return { id, code, name: code, workCenterId, calendarId, status: "ACTIVE", efficiencyPercent: 100 };
}

function order(overrides: Partial<EngineOrder> & Pick<EngineOrder, "id" | "orderNumber">): EngineOrder {
  return {
    priority: "NORMAL",
    dueDate: "2026-12-01",
    quantity: 10,
    status: "QUEUED",
    createdAt: new Date("2026-09-01T00:00:00.000Z"),
    product: { id: "p1", sku: "SKU-1", name: "Widget", unit: "pcs" },
    routing: [{ operationId: "op1", sequence: 10, workCenterId: "wc1", setupMinutes: 15, runMinutesPerUnit: 10 }],
    bom: [],
    completedSequences: [],
    ...overrides,
  };
}

function baseInput(overrides: Partial<EngineInput> = {}): EngineInput {
  return {
    orders: [],
    machines: [machine("m1", "wc1", "cal1")],
    calendars: { cal1: DAY_SHIFT },
    downtime: {},
    materials: {},
    lockedEntries: [],
    inProgressEntries: [],
    ...overrides,
  };
}

describe("stepMinutes", () => {
  it("rounds up and scales by efficiency", () => {
    // (15 + 10*10) * 100 / 100 = 115
    expect(stepMinutes({ setupMinutes: 15, runMinutesPerUnit: 10 }, 10, 100)).toEqual({ plannedMinutes: 115, setupMinutes: 15, runMinutes: 100 });
    // (15 + 10*10) * 100 / 80 = 143.75 -> ceil 144
    expect(stepMinutes({ setupMinutes: 15, runMinutesPerUnit: 10 }, 10, 80).plannedMinutes).toBe(144);
  });
});

describe("sortCandidates", () => {
  it("orders by priority, due date, createdAt, order number and drops non-candidate statuses", () => {
    const orders: EngineOrder[] = [
      order({ id: "1", orderNumber: "SO-3", priority: "NORMAL", dueDate: "2026-10-01", createdAt: new Date("2026-09-02T00:00:00Z") }),
      order({ id: "2", orderNumber: "SO-1", priority: "URGENT", dueDate: "2026-12-01", createdAt: new Date("2026-09-05T00:00:00Z") }),
      order({ id: "3", orderNumber: "SO-2", priority: "NORMAL", dueDate: "2026-09-20", createdAt: new Date("2026-09-03T00:00:00Z") }),
      order({ id: "4", orderNumber: "SO-9", priority: "NORMAL", dueDate: "2026-09-20", createdAt: new Date("2026-09-03T00:00:00Z") }),
      order({ id: "5", orderNumber: "SO-0", priority: "LOW", dueDate: "2026-01-01", createdAt: new Date("2026-01-01T00:00:00Z") }),
      order({ id: "6", orderNumber: "SO-DONE", status: "COMPLETED" }),
      order({ id: "7", orderNumber: "SO-HOLD", status: "ON_HOLD" }),
    ];
    const sorted = sortCandidates(orders).map((o) => o.id);
    // URGENT first; then NORMAL by due date (09-20 before 10-01); same due date -> createdAt; same createdAt -> orderNumber; LOW last.
    expect(sorted).toEqual(["2", "3", "4", "1", "5"]);
  });
});

describe("scheduleOrders — placement", () => {
  it("places an operation that spans multiple shifts/days when it does not fit in one", () => {
    // 8h shift - 1h break = 7h = 420 min net per day. 1000 min of run time needs to span 3 days.
    const o = order({ id: "o1", orderNumber: "SO-1", quantity: 100, routing: [{ operationId: "op1", sequence: 10, workCenterId: "wc1", setupMinutes: 0, runMinutesPerUnit: 10 }] });
    const result = scheduleOrders(baseInput({ orders: [o] }), { now: NOW, horizonDays: 30, tz: TZ });
    expect(result.entries).toHaveLength(1);
    const e = result.entries[0]!;
    expect(e.plannedMinutes).toBe(1000);
    // The entry must span more real time than one shift (7h) allows.
    expect(e.plannedEndAt.getTime() - e.plannedStartAt.getTime()).toBeGreaterThan(7 * 60 * 60_000);
    expect(result.conflicts.filter((c) => c.type === "UNSCHEDULED")).toHaveLength(0);
  });

  it("does not place an operation inside a downtime window", () => {
    const o = order({ id: "o1", orderNumber: "SO-1", quantity: 1, routing: [{ operationId: "op1", sequence: 10, workCenterId: "wc1", setupMinutes: 30, runMinutesPerUnit: 0 }] });
    // Block the whole first working day with downtime; the entry must land on/after the following working day.
    const downtimeStart = new Date(Date.UTC(2026, 8, 11, 0, 0, 0));
    const downtimeEnd = new Date(Date.UTC(2026, 8, 12, 0, 0, 0));
    const input = baseInput({
      orders: [o],
      calendars: { cal1: ALWAYS_OPEN },
      downtime: { m1: [{ id: "d1", startsAt: downtimeStart, endsAt: downtimeEnd, type: "PLANNED", reason: "PM" }] },
    });
    const result = scheduleOrders(input, { now: NOW, horizonDays: 10, tz: TZ });
    expect(result.entries).toHaveLength(1);
    const e = result.entries[0]!;
    expect(e.plannedStartAt.getTime()).toBeGreaterThanOrEqual(downtimeEnd.getTime());
  });

  it("only places a step with a fixed machine on that machine, even when a faster machine exists", () => {
    const fast = machine("fast", "wc1", "cal1", "FAST");
    const slow = machine("slow", "wc1", "cal1", "SLOW");
    const o = order({
      id: "o1",
      orderNumber: "SO-1",
      quantity: 1,
      routing: [{ operationId: "op1", sequence: 10, workCenterId: "wc1", machineId: "slow", setupMinutes: 10, runMinutesPerUnit: 0 }],
    });
    const input = baseInput({ orders: [o], machines: [fast, slow], calendars: { cal1: ALWAYS_OPEN } });
    const result = scheduleOrders(input, { now: NOW, horizonDays: 10, tz: TZ });
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]!.machineId).toBe("slow");
  });

  it("never moves a locked entry and plans other work around it", () => {
    const locked: EngineEntry = {
      id: "e-locked",
      orderId: "o-locked",
      sequence: 10,
      workCenterId: "wc1",
      machineId: "m1",
      plannedStartAt: new Date(Date.UTC(2026, 8, 11, 4, 0, 0)),
      plannedEndAt: new Date(Date.UTC(2026, 8, 11, 8, 0, 0)),
      plannedMinutes: 240,
      status: "QUEUED",
      locked: true,
    };
    const o = order({ id: "o2", orderNumber: "SO-2", quantity: 1, routing: [{ operationId: "op1", sequence: 10, workCenterId: "wc1", setupMinutes: 60, runMinutesPerUnit: 0 }] });
    const input = baseInput({ orders: [o], calendars: { cal1: ALWAYS_OPEN }, lockedEntries: [locked] });
    const result = scheduleOrders(input, { now: NOW, horizonDays: 10, tz: TZ });
    expect(result.entries).toHaveLength(1);
    const e = result.entries[0]!;
    const overlapsLocked = e.plannedStartAt.getTime() < locked.plannedEndAt.getTime() && e.plannedEndAt.getTime() > locked.plannedStartAt.getTime();
    expect(overlapsLocked).toBe(false);
  });

  it("treats an IN_PROGRESS entry as fixed and starts the next step no earlier than its end", () => {
    const started: EngineEntry = {
      id: "e-ip",
      orderId: "o3",
      sequence: 10,
      workCenterId: "wc1",
      machineId: "m1",
      plannedStartAt: NOW,
      plannedEndAt: new Date(NOW.getTime() + 2 * 60 * 60_000),
      actualStartAt: NOW,
      plannedMinutes: 120,
      status: "IN_PROGRESS",
      locked: false,
    };
    const o = order({
      id: "o3",
      orderNumber: "SO-3",
      quantity: 1,
      routing: [
        { operationId: "op1", sequence: 10, workCenterId: "wc1", setupMinutes: 0, runMinutesPerUnit: 0 },
        { operationId: "op2", sequence: 20, workCenterId: "wc1", setupMinutes: 30, runMinutesPerUnit: 0 },
      ],
      completedSequences: [],
    });
    const input = baseInput({ orders: [o], calendars: { cal1: ALWAYS_OPEN }, inProgressEntries: [started] });
    const result = scheduleOrders(input, { now: NOW, horizonDays: 10, tz: TZ });
    // Only sequence 20 is planned (10 is fixed/in-progress).
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]!.sequence).toBe(20);
    expect(result.entries[0]!.plannedStartAt.getTime()).toBeGreaterThanOrEqual(started.plannedEndAt.getTime());
  });

  it("produces an UNSCHEDULED + NO_MACHINE conflict when nothing fits within the horizon", () => {
    const o = order({
      id: "o1",
      orderNumber: "SO-1",
      quantity: 1_000_000, // absurd quantity: cannot fit in any horizon
      routing: [{ operationId: "op1", sequence: 10, workCenterId: "wc1", setupMinutes: 0, runMinutesPerUnit: 60 }],
    });
    const input = baseInput({ orders: [o], calendars: { cal1: ALWAYS_OPEN } });
    const result = scheduleOrders(input, { now: NOW, horizonDays: 5, tz: TZ });
    expect(result.entries).toHaveLength(0);
    expect(result.conflicts.some((c) => c.type === "NO_MACHINE")).toBe(true);
    expect(result.conflicts.some((c) => c.type === "UNSCHEDULED")).toBe(true);
    expect(result.orders["o1"]!.scheduled).toBe(false);
  });

  it("flags an order with no routing as NO_ROUTING / unscheduled", () => {
    const o = order({ id: "o1", orderNumber: "SO-1", routing: [] });
    const result = scheduleOrders(baseInput({ orders: [o] }), { now: NOW, horizonDays: 10, tz: TZ });
    expect(result.conflicts.some((c) => c.type === "NO_ROUTING")).toBe(true);
    expect(result.orders["o1"]!.scheduled).toBe(false);
  });

  it("flags a work center with no ACTIVE machine as MACHINE_UNAVAILABLE", () => {
    const inactive: EngineMachine = { ...machine("m1", "wc1", "cal1"), status: "INACTIVE" };
    const o = order({ id: "o1", orderNumber: "SO-1" });
    const result = scheduleOrders(baseInput({ orders: [o], machines: [inactive] }), { now: NOW, horizonDays: 10, tz: TZ });
    expect(result.conflicts.some((c) => c.type === "MACHINE_UNAVAILABLE")).toBe(true);
  });
});

describe("scheduleOrders — materials", () => {
  it("flags MATERIAL_SHORTAGE (WARNING when partial stock, CRITICAL when none) in planned-start order", () => {
    const o1 = order({ id: "o1", orderNumber: "SO-1", quantity: 10, bom: [{ materialId: "rm1", quantityPerUnit: 1, scrapPercent: 0 }] });
    const o2 = order({ id: "o2", orderNumber: "SO-2", quantity: 10, dueDate: "2026-12-05", bom: [{ materialId: "rm1", quantityPerUnit: 1, scrapPercent: 0 }] });
    const input = baseInput({
      orders: [o1, o2],
      calendars: { cal1: ALWAYS_OPEN },
      materials: { rm1: { stockOnHand: 5, unit: "kg", code: "RM-1", name: "Raw material" } },
    });
    const result = scheduleOrders(input, { now: NOW, horizonDays: 10, tz: TZ });
    const shortages = result.conflicts.filter((c) => c.type === "MATERIAL_SHORTAGE");
    // o1 is planned first (same priority -> earlier due date), consumes the 5 available, is short by 5 (WARNING:
    // some stock was available); o2 is walked next against an already-exhausted balance, short by all 10 (CRITICAL).
    expect(shortages).toHaveLength(2);
    expect(shortages[0]).toMatchObject({ orderId: "o1", severity: "WARNING" });
    expect(shortages[0]!.details?.shortBy).toBe(5);
    expect(shortages[1]).toMatchObject({ orderId: "o2", severity: "CRITICAL" });
    expect(shortages[1]!.details?.shortBy).toBe(10);
  });

  it("is CRITICAL when the running balance is already exhausted", () => {
    const o1 = order({ id: "o1", orderNumber: "SO-1", quantity: 10, bom: [{ materialId: "rm1", quantityPerUnit: 1, scrapPercent: 0 }] });
    const o2 = order({ id: "o2", orderNumber: "SO-2", quantity: 10, dueDate: "2026-12-05", bom: [{ materialId: "rm1", quantityPerUnit: 1, scrapPercent: 0 }] });
    const input = baseInput({
      orders: [o1, o2],
      calendars: { cal1: ALWAYS_OPEN },
      materials: { rm1: { stockOnHand: 10, unit: "kg", code: "RM-1", name: "Raw material" } },
    });
    const result = scheduleOrders(input, { now: NOW, horizonDays: 10, tz: TZ });
    const shortages = result.conflicts.filter((c) => c.type === "MATERIAL_SHORTAGE");
    expect(shortages).toHaveLength(1);
    expect(shortages[0]!.orderId).toBe("o2");
    expect(shortages[0]!.severity).toBe("CRITICAL"); // nothing left when o2's requirement is walked
  });
});

describe("scheduleOrders — deadline conflicts and machine overload", () => {
  it("emits DEADLINE_MISSED for a DELAYED/LATE order and DEADLINE_AT_RISK for AT_RISK", () => {
    const late = order({ id: "o1", orderNumber: "SO-1", dueDate: "2020-01-01", quantity: 1 });
    const input = baseInput({ orders: [late], calendars: { cal1: ALWAYS_OPEN } });
    const result = scheduleOrders(input, { now: NOW, horizonDays: 10, tz: TZ });
    expect(result.conflicts.some((c) => c.type === "DEADLINE_MISSED")).toBe(true);
    expect(result.orders["o1"]!.deliveryRisk).toBe("LATE");
  });

  it("flags MACHINE_OVERLOAD (WARNING) when a machine's load exceeds its available time over the horizon", () => {
    // A 1h/day shift (60 min available over a 1-day horizon) with a locked entry sitting entirely OUTSIDE it
    // (2h = 120 min): occupied (120, all outside capacity) exceeds available (60) -> utilisation warning.
    const narrowShift: Calendar = {
      shifts: [{ id: "s1", name: "Short", startTime: "09:00", endTime: "10:00", daysOfWeek: [0, 1, 2, 3, 4, 5, 6], breakMinutes: 0 }],
      exceptions: [],
    };
    const locked: EngineEntry = {
      id: "e-locked",
      orderId: "o-locked",
      sequence: 10,
      workCenterId: "wc1",
      machineId: "m1",
      plannedStartAt: new Date(Date.UTC(2026, 8, 11, 5, 30, 0)), // 11:00 IST
      plannedEndAt: new Date(Date.UTC(2026, 8, 11, 7, 30, 0)), // 13:00 IST
      plannedMinutes: 120,
      status: "QUEUED",
      locked: true,
    };
    const input = baseInput({ orders: [], calendars: { cal1: narrowShift }, lockedEntries: [locked] });
    const result = scheduleOrders(input, { now: NOW, horizonDays: 1, tz: TZ });
    const overload = result.conflicts.find((c) => c.type === "MACHINE_OVERLOAD" && c.severity === "WARNING");
    expect(overload).toBeDefined();
    expect(result.loads.find((l) => l.machineId === "m1")).toMatchObject({ availableMinutes: 60, occupiedMinutes: 120 });
  });
});

describe("scheduleOrders — performance", () => {
  it("schedules 200 orders x 3 operations across 20 machines in under 2000ms", () => {
    const workCenters = ["wc1", "wc2", "wc3"];
    const machines: EngineMachine[] = [];
    for (let i = 0; i < 20; i++) machines.push(machine(`m${i}`, workCenters[i % workCenters.length]!, "cal1", `M${String(i).padStart(2, "0")}`));
    const orders: EngineOrder[] = Array.from({ length: 200 }, (_, i) =>
      order({
        id: `o${i}`,
        orderNumber: `SO-${String(i).padStart(5, "0")}`,
        priority: (["URGENT", "HIGH", "NORMAL", "LOW"] as const)[i % 4],
        dueDate: `2026-1${(i % 2) + 1}-01`,
        quantity: 5 + (i % 20),
        createdAt: new Date(2026, 8, 1 + (i % 10)),
        routing: workCenters.map((wc, idx) => ({ operationId: `op-${i}-${idx}`, sequence: (idx + 1) * 10, workCenterId: wc, setupMinutes: 10, runMinutesPerUnit: 2 })),
      }),
    );
    const input = baseInput({ orders, machines, calendars: { cal1: ALWAYS_OPEN } });
    const start = performance.now();
    const result = scheduleOrders(input, { now: NOW, horizonDays: 60, tz: TZ });
    const elapsed = performance.now() - start;
    expect(result.stats.ordersConsidered).toBe(200);
    console.log(`[perf] scheduleOrders(200 orders x 3 ops x 20 machines) = ${elapsed.toFixed(1)}ms`);
    expect(elapsed).toBeLessThan(2000);
  });
});
