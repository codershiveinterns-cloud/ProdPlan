import { describe, expect, it } from "vitest";
import { canMove, nextSequence, operationMinutes, planRenumber, routingMinutes, sortBySequence } from "@/lib/routing";

const rows = [
  { id: "c", sequence: 30 },
  { id: "a", sequence: 10 },
  { id: "b", sequence: 20 },
];

describe("planRenumber", () => {
  it("renumbers to 10, 20, 30 in current order with unique negative temporaries", () => {
    const plan = planRenumber(rows);
    expect(plan).toEqual([
      { id: "a", tempSequence: -1, finalSequence: 10 },
      { id: "b", tempSequence: -2, finalSequence: 20 },
      { id: "c", tempSequence: -3, finalSequence: 30 },
    ]);
    const temps = plan.map((p) => p.tempSequence);
    expect(new Set(temps).size).toBe(temps.length);
    expect(temps.every((t) => t < 0)).toBe(true);
  });

  it("normalises irregular sequences (5, 7, 100) to 10, 20, 30", () => {
    const plan = planRenumber([
      { id: "y", sequence: 7 },
      { id: "x", sequence: 5 },
      { id: "z", sequence: 100 },
    ]);
    expect(plan.map((p) => [p.id, p.finalSequence])).toEqual([
      ["x", 10],
      ["y", 20],
      ["z", 30],
    ]);
  });

  it("moves a row up or down by one step", () => {
    expect(planRenumber(rows, { id: "b", direction: "up" }).map((p) => p.id)).toEqual(["b", "a", "c"]);
    expect(planRenumber(rows, { id: "b", direction: "down" }).map((p) => p.id)).toEqual(["a", "c", "b"]);
    expect(planRenumber(rows, { id: "c", direction: "up" }).map((p) => p.id)).toEqual(["a", "c", "b"]);
  });

  it("is a no-op on the order when moving the first row up or the last row down", () => {
    expect(planRenumber(rows, { id: "a", direction: "up" }).map((p) => p.id)).toEqual(["a", "b", "c"]);
    expect(planRenumber(rows, { id: "c", direction: "down" }).map((p) => p.id)).toEqual(["a", "b", "c"]);
  });

  it("throws on an unknown id and does not mutate its input", () => {
    const copy = rows.map((r) => ({ ...r }));
    expect(() => planRenumber(rows, { id: "nope", direction: "up" })).toThrow(RangeError);
    planRenumber(rows, { id: "b", direction: "up" });
    expect(rows).toEqual(copy);
  });

  it("handles empty and single-row routings", () => {
    expect(planRenumber([])).toEqual([]);
    expect(planRenumber([{ id: "only", sequence: 40 }], { id: "only", direction: "down" })).toEqual([
      { id: "only", tempSequence: -1, finalSequence: 10 },
    ]);
  });
});

describe("sortBySequence / canMove", () => {
  it("sorts stably by sequence", () => {
    expect(sortBySequence(rows).map((r) => r.id)).toEqual(["a", "b", "c"]);
    expect(sortBySequence([{ id: "p", sequence: 10 }, { id: "q", sequence: 10 }]).map((r) => r.id)).toEqual(["p", "q"]);
  });

  it("canMove reflects the position", () => {
    expect(canMove(rows, "a", "up")).toBe(false);
    expect(canMove(rows, "a", "down")).toBe(true);
    expect(canMove(rows, "c", "down")).toBe(false);
    expect(canMove(rows, "c", "up")).toBe(true);
    expect(canMove(rows, "zz", "up")).toBe(false);
  });
});

describe("nextSequence", () => {
  it("returns max + 10 (aligned to 10) and 10 for an empty routing", () => {
    expect(nextSequence([])).toBe(10);
    expect(nextSequence([10, 20])).toBe(30);
    expect(nextSequence([15])).toBe(20);
    expect(nextSequence(rows)).toBe(40);
    expect(nextSequence([{ id: "x", sequence: 100 }, 5])).toBe(110);
  });
});

describe("operationMinutes", () => {
  it("applies (setup + qty × run) × 100 / efficiency", () => {
    expect(operationMinutes(30, 100, 0.5)).toBe(80);
    expect(operationMinutes(30, 100, 0.5, 80)).toBe(100);
    expect(operationMinutes("30", "100", "0.5", "100")).toBe(80);
    expect(operationMinutes(0, 3, 0.1, 100)).toBe(0.3);
    expect(operationMinutes(10, 7, 1.234, 100)).toBe(18.6);
  });

  it("rejects invalid efficiency or inputs", () => {
    expect(() => operationMinutes(30, 100, 0.5, 0)).toThrow(RangeError);
    expect(() => operationMinutes("x", 100, 0.5)).toThrow(RangeError);
  });

  it("routingMinutes sums operations", () => {
    expect(
      routingMinutes(
        [
          { setupMinutes: 30, runMinutesPerUnit: 0.5 },
          { setupMinutes: 10, runMinutesPerUnit: 0.25 },
        ],
        100,
      ),
    ).toBe(115);
    expect(routingMinutes([], 100)).toBe(0);
  });
});
