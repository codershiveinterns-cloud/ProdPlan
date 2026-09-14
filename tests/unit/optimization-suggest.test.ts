/**
 * `generateSuggestions()` (docs/M3_SPEC.md §3): pure, in-memory optimizer suggestions on top of the M2 engine.
 * Modeled on tests/unit/scheduling-engine.test.ts's fixtures and its performance-test pattern.
 */
import { describe, expect, it } from "vitest";
import type { Calendar } from "@/lib/calendar";
import { scheduleOrders } from "@/lib/scheduling/engine";
import type { EngineInput, EngineMachine, EngineOrder } from "@/lib/scheduling/types";
import { generateSuggestions, MAX_SUGGESTIONS, totalLateMinutes } from "@/lib/optimization/suggest";

const TZ = "Asia/Kolkata";
const NOW = new Date("2026-09-11T02:00:00.000Z"); // 07:30 IST, Friday

const ALWAYS_OPEN: Calendar = {
  shifts: [{ id: "s1", name: "Always", startTime: "00:00", endTime: "23:59", daysOfWeek: [0, 1, 2, 3, 4, 5, 6], breakMinutes: 0 }],
  exceptions: [],
};

function machine(id: string, workCenterId: string, calendarId = "cal1", code = id): EngineMachine {
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
    machines: [machine("m1", "wc1")],
    calendars: { cal1: ALWAYS_OPEN },
    downtime: {},
    materials: {},
    lockedEntries: [],
    inProgressEntries: [],
    ...overrides,
  };
}

const OPTS = { now: NOW, horizonDays: 30, tz: TZ };

describe("generateSuggestions — REASSIGN_MACHINE", () => {
  it("suggests moving a step off the machine it defaulted to when that frees capacity for a fixed-machine order and reduces total lateness", () => {
    // X (HIGH, free-choice step) and a fixed-machine order Z (NORMAL, pinned to m1) both want wc1's machines. The
    // engine's greedy per-order placement processes X first and ties m1/m2 (both free, same duration) — the
    // tie-break ("lower machine code") lands X on m1, which then blocks Z (which has no choice) for ~7 days,
    // making Z DELAYED. X itself is already non-ON_TRACK (AT_RISK from an unrelated material shortage, so its own
    // contribution to total late-minutes is 0 either way) — exactly the "not ON_TRACK" candidate the optimizer
    // tries perturbations on. Reassigning X's step to m2 does not change X's own finish (still a tie) but frees
    // m1 for Z immediately, taking Z back to ON_TRACK — a real reduction in the WHOLE PLAN's total late-minutes
    // that the per-order greedy algorithm could not see on its own.
    const x = order({
      id: "x",
      orderNumber: "SO-X",
      priority: "HIGH",
      dueDate: "2026-12-01", // comfortable — only the shortage keeps it off ON_TRACK
      quantity: 1000,
      routing: [{ operationId: "opX", sequence: 10, workCenterId: "wc1", setupMinutes: 0, runMinutesPerUnit: 10 }], // ~6.9 days
      bom: [{ materialId: "mat1", quantityPerUnit: 1, scrapPercent: 0 }],
      createdAt: new Date("2026-09-01T00:00:00.000Z"),
    });
    const z = order({
      id: "z",
      orderNumber: "SO-Z",
      priority: "NORMAL",
      dueDate: "2026-09-13", // 2 days out — blocked behind X on m1 otherwise
      quantity: 1,
      routing: [{ operationId: "opZ", sequence: 10, workCenterId: "wc1", machineId: "m1", setupMinutes: 10, runMinutesPerUnit: 10 }],
      createdAt: new Date("2026-09-02T00:00:00.000Z"),
    });
    const input = baseInput({
      orders: [x, z],
      machines: [machine("m1", "wc1"), machine("m2", "wc1")],
      materials: { mat1: { stockOnHand: 0, unit: "kg", code: "MAT-1", name: "Material 1" } },
    });

    const baseline = scheduleOrders(input, OPTS);
    expect(baseline.orders["x"]!.deliveryRisk).toBe("AT_RISK");
    expect(baseline.orders["z"]!.deliveryRisk).toBe("DELAYED");

    const suggestions = generateSuggestions(input, baseline, OPTS);
    const reassign = suggestions.find((s) => s.kind === "REASSIGN_MACHINE" && s.orderId === "x");
    expect(reassign).toBeDefined();
    expect(reassign!.fromMachineCode).toBe("m1");
    expect(reassign!.toMachineCode).toBe("m2");
    expect(reassign!.sequence).toBe(10);
    expect(reassign!.projectedLateMinutes).toBeLessThan(reassign!.currentLateMinutes);
    expect(reassign!.summary).toMatch(/SO-X/);
    expect(reassign!.rationale).toMatch(/m2/);
  });

  it("does not suggest REASSIGN_MACHINE when the step's machine is fixed by the routing", () => {
    const blocker: import("@/lib/scheduling/types").EngineEntry = {
      id: "e-blocker",
      orderId: "o-blocker",
      sequence: 10,
      workCenterId: "wc1",
      machineId: "m1",
      plannedStartAt: NOW,
      plannedEndAt: new Date(NOW.getTime() + 5 * 24 * 60 * 60 * 1000),
      plannedMinutes: 5 * 24 * 60,
      status: "IN_PROGRESS",
      locked: false,
      actualStartAt: NOW,
    };
    const target = order({
      id: "o1",
      orderNumber: "SO-1",
      dueDate: "2026-09-12",
      quantity: 1,
      routing: [{ operationId: "op1", sequence: 10, workCenterId: "wc1", machineId: "m1", setupMinutes: 10, runMinutesPerUnit: 10 }],
    });
    const input = baseInput({ orders: [target], machines: [machine("m1", "wc1"), machine("m2", "wc1")], inProgressEntries: [blocker] });
    const baseline = scheduleOrders(input, OPTS);
    const suggestions = generateSuggestions(input, baseline, OPTS);
    expect(suggestions.some((s) => s.kind === "REASSIGN_MACHINE" && s.orderId === "o1")).toBe(false);
  });
});

describe("generateSuggestions — REPRIORITIZE", () => {
  it("suggests raising priority when it lets an order jump ahead of a same-machine order it is tied behind on priority", () => {
    // "blocker" is HIGH and processed first regardless of due date, occupying the only machine for ~10 days.
    // "target" is NORMAL (rank below HIGH) with a due date 2 days out, so it is stuck behind — DELAYED. Bumping
    // it NORMAL -> HIGH ties it with "blocker"; the tie-break (due date asc) then puts target FIRST, since its
    // due date is much sooner, letting it finish comfortably on time.
    const blocker = order({
      id: "blocker",
      orderNumber: "SO-BLOCKER",
      priority: "HIGH",
      dueDate: "2026-12-01",
      quantity: 10,
      routing: [{ operationId: "op1", sequence: 10, workCenterId: "wc1", setupMinutes: 0, runMinutesPerUnit: 1440 }], // ~10 days
      createdAt: new Date("2026-09-02T00:00:00.000Z"),
    });
    const target = order({
      id: "target",
      orderNumber: "SO-TARGET",
      priority: "NORMAL",
      dueDate: "2026-09-13", // due in ~2 days — stuck behind "blocker" otherwise
      quantity: 1,
      routing: [{ operationId: "op2", sequence: 10, workCenterId: "wc1", setupMinutes: 10, runMinutesPerUnit: 10 }],
      createdAt: new Date("2026-09-01T00:00:00.000Z"),
    });
    const input = baseInput({ orders: [blocker, target], machines: [machine("m1", "wc1")] });
    const baseline = scheduleOrders(input, OPTS);
    expect(baseline.orders["target"]!.deliveryRisk).not.toBe("ON_TRACK");

    const suggestions = generateSuggestions(input, baseline, OPTS);
    const reprioritize = suggestions.find((s) => s.kind === "REPRIORITIZE" && s.orderId === "target");
    expect(reprioritize).toBeDefined();
    expect(reprioritize!.fromPriority).toBe("NORMAL");
    expect(reprioritize!.toPriority).toBe("HIGH");
    expect(reprioritize!.projectedLateMinutes).toBeLessThan(reprioritize!.currentLateMinutes);
  });

  it("never suggests raising priority past URGENT", () => {
    const already = order({ id: "o1", orderNumber: "SO-1", priority: "URGENT", dueDate: "2020-01-01", quantity: 1 });
    const input = baseInput({ orders: [already] });
    const baseline = scheduleOrders(input, OPTS);
    const suggestions = generateSuggestions(input, baseline, OPTS);
    expect(suggestions.some((s) => s.kind === "REPRIORITIZE" && s.orderId === "o1")).toBe(false);
  });
});

describe("generateSuggestions — safety and caps", () => {
  it("never suggests a candidate that is already ON_TRACK", () => {
    const onTrack = order({ id: "o1", orderNumber: "SO-1", dueDate: "2026-12-01", quantity: 1 });
    const input = baseInput({ orders: [onTrack] });
    const baseline = scheduleOrders(input, OPTS);
    expect(baseline.orders["o1"]!.deliveryRisk).toBe("ON_TRACK");
    const suggestions = generateSuggestions(input, baseline, OPTS);
    expect(suggestions).toHaveLength(0);
  });

  it("caps the result at MAX_SUGGESTIONS, sorted by projected minutes saved (desc)", () => {
    // 12 independent LATE orders, one dedicated machine each in its own work center — every REPRIORITIZE
    // perturbation improves its own order without touching any other, so up to 12 suggestions are generated.
    const orders: EngineOrder[] = [];
    const machines: EngineMachine[] = [];
    for (let i = 0; i < 12; i++) {
      const wc = `wc${i}`;
      machines.push(machine(`m${i}`, wc));
      orders.push(
        order({
          id: `o${i}`,
          orderNumber: `SO-${i}`,
          priority: "LOW",
          dueDate: "2020-01-01", // already LATE
          quantity: 1,
          routing: [{ operationId: `op${i}`, sequence: 10, workCenterId: wc, setupMinutes: 5 + i, runMinutesPerUnit: 5 }],
        }),
      );
    }
    const input = baseInput({ orders, machines });
    const baseline = scheduleOrders(input, OPTS);
    const suggestions = generateSuggestions(input, baseline, OPTS);
    expect(suggestions.length).toBeLessThanOrEqual(MAX_SUGGESTIONS);
    for (let i = 1; i < suggestions.length; i++) {
      const savedPrev = suggestions[i - 1]!.currentLateMinutes - suggestions[i - 1]!.projectedLateMinutes;
      const savedCur = suggestions[i]!.currentLateMinutes - suggestions[i]!.projectedLateMinutes;
      expect(savedPrev).toBeGreaterThanOrEqual(savedCur);
    }
  });
});

describe("totalLateMinutes", () => {
  it("sums max(0, plannedEnd - dueEnd) over LATE/DELAYED orders only", () => {
    const onTime = order({ id: "o1", orderNumber: "SO-1", dueDate: "2026-12-01", quantity: 1 });
    const input = baseInput({ orders: [onTime] });
    const result = scheduleOrders(input, OPTS);
    expect(totalLateMinutes(result, input.orders, TZ)).toBe(0);
  });
});

describe("generateSuggestions — performance", () => {
  it("completes for a synthetic 30-order/6-machine input in under 3000ms", () => {
    const workCenters = ["wc1", "wc2", "wc3"];
    const machines: EngineMachine[] = [];
    for (let i = 0; i < 6; i++) machines.push(machine(`m${i}`, workCenters[i % workCenters.length]!, "cal1", `M${String(i).padStart(2, "0")}`));
    const orders: EngineOrder[] = Array.from({ length: 30 }, (_, i) =>
      order({
        id: `o${i}`,
        orderNumber: `SO-${String(i).padStart(3, "0")}`,
        priority: (["URGENT", "HIGH", "NORMAL", "LOW"] as const)[i % 4],
        dueDate: i % 3 === 0 ? "2026-09-15" : "2026-12-01", // some tight, some comfortable
        quantity: 5 + (i % 20),
        createdAt: new Date(2026, 8, 1 + (i % 10)),
        routing: workCenters.map((wc, idx) => ({ operationId: `op-${i}-${idx}`, sequence: (idx + 1) * 10, workCenterId: wc, setupMinutes: 10, runMinutesPerUnit: 30 })),
      }),
    );
    const input = baseInput({ orders, machines });
    const baseline = scheduleOrders(input, OPTS);

    const start = performance.now();
    const suggestions = generateSuggestions(input, baseline, OPTS);
    const elapsed = performance.now() - start;

    console.log(`[perf] generateSuggestions(30 orders x 6 machines) = ${elapsed.toFixed(1)}ms, ${suggestions.length} suggestions`);
    expect(elapsed).toBeLessThan(3000);
  });
});
