/** Move validation (docs/M2_SPEC.md §3 "Drag-to-reschedule", §7): eligibility + 15-min snap / shift-forward. */
import { describe, expect, it } from "vitest";
import { DomainError, NotFoundError } from "@/lib/errors";
import { MOVE_SNAP_MINUTES, snapMoveInstant, validateMove } from "@/lib/scheduling/move";
import type { Interval } from "@/lib/scheduling/windows";

describe("validateMove", () => {
  const targetMachine = { id: "m2", workCenterId: "wc1", status: "ACTIVE" as const };

  it("allows a QUEUED entry moving to an ACTIVE machine in the same work center", () => {
    expect(() => validateMove({ entryStatus: "QUEUED", entryWorkCenterId: "wc1", targetMachine })).not.toThrow();
  });

  it("rejects moving an IN_PROGRESS or COMPLETED entry", () => {
    expect(() => validateMove({ entryStatus: "IN_PROGRESS", entryWorkCenterId: "wc1", targetMachine })).toThrow(DomainError);
    expect(() => validateMove({ entryStatus: "COMPLETED", entryWorkCenterId: "wc1", targetMachine })).toThrow(DomainError);
  });

  it("allows moving an ON_HOLD or SKIPPED entry", () => {
    expect(() => validateMove({ entryStatus: "ON_HOLD", entryWorkCenterId: "wc1", targetMachine })).not.toThrow();
    expect(() => validateMove({ entryStatus: "SKIPPED", entryWorkCenterId: "wc1", targetMachine })).not.toThrow();
  });

  it("rejects a missing target machine", () => {
    expect(() => validateMove({ entryStatus: "QUEUED", entryWorkCenterId: "wc1", targetMachine: null })).toThrow(NotFoundError);
  });

  it("rejects a target machine in a different work center", () => {
    expect(() =>
      validateMove({ entryStatus: "QUEUED", entryWorkCenterId: "wc1", targetMachine: { id: "m2", workCenterId: "wc2", status: "ACTIVE" } }),
    ).toThrow(/same work center/);
  });

  it("rejects moving to any machine other than the routing step's fixed machine", () => {
    expect(() => validateMove({ entryStatus: "QUEUED", entryWorkCenterId: "wc1", targetMachine, fixedMachineId: "m1" })).toThrow(/fixed to a specific machine/);
    // Moving onto the fixed machine itself is fine.
    expect(() => validateMove({ entryStatus: "QUEUED", entryWorkCenterId: "wc1", targetMachine, fixedMachineId: "m2" })).not.toThrow();
  });

  // Regression: a locked entry must never be dropped onto a machine that isn't schedulable — the engine treats a
  // locked entry as fixed regardless of machine status, so nothing downstream would ever flag it otherwise.
  it("rejects a target machine that is not ACTIVE (MAINTENANCE or INACTIVE)", () => {
    expect(() =>
      validateMove({ entryStatus: "QUEUED", entryWorkCenterId: "wc1", targetMachine: { id: "m2", workCenterId: "wc1", status: "MAINTENANCE" } }),
    ).toThrow(/active machines/);
    expect(() =>
      validateMove({ entryStatus: "QUEUED", entryWorkCenterId: "wc1", targetMachine: { id: "m2", workCenterId: "wc1", status: "INACTIVE" } }),
    ).toThrow(DomainError);
  });
});

describe("snapMoveInstant", () => {
  it(`snaps to the nearest ${MOVE_SNAP_MINUTES} minutes`, () => {
    const free: Interval[] = [{ s: 0, e: 24 * 60 * 60_000 }];
    // 09:07 -> 09:00 (nearer than 09:15).
    expect(snapMoveInstant(new Date("2026-09-11T09:07:00.000Z"), free)).toEqual(new Date("2026-09-11T09:00:00.000Z"));
    // 09:08 -> 09:15 (halfway rounds up).
    expect(snapMoveInstant(new Date("2026-09-11T09:07:30.000Z"), free)).toEqual(new Date("2026-09-11T09:15:00.000Z"));
  });

  it("shifts forward to the next working instant when the snapped time falls in non-working time", () => {
    const free: Interval[] = [
      { s: new Date("2026-09-11T09:00:00.000Z").getTime(), e: new Date("2026-09-11T17:00:00.000Z").getTime() },
      { s: new Date("2026-09-12T09:00:00.000Z").getTime(), e: new Date("2026-09-12T17:00:00.000Z").getTime() },
    ];
    // 20:00 (after the shift ends) snaps to itself, then shifts to the next day's shift start.
    const result = snapMoveInstant(new Date("2026-09-11T20:00:00.000Z"), free);
    expect(result).toEqual(new Date("2026-09-12T09:00:00.000Z"));
  });

  it("stays put when the snapped instant is already working time", () => {
    const free: Interval[] = [{ s: new Date("2026-09-11T09:00:00.000Z").getTime(), e: new Date("2026-09-11T17:00:00.000Z").getTime() }];
    const result = snapMoveInstant(new Date("2026-09-11T10:30:00.000Z"), free);
    expect(result).toEqual(new Date("2026-09-11T10:30:00.000Z"));
  });
});
