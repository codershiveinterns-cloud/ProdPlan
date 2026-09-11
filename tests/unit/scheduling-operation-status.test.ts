/** Pure operation-status machine + roll-up rule (docs/M2_SPEC.md §4, §7 "every legal/illegal pair x role"). */
import { describe, expect, it } from "vitest";
import type { OperationStatus, Role } from "@/generated/prisma/enums";
import {
  allowedOperationTargets,
  canTransitionOperation,
  decodeHeldFrom,
  encodeHeldFrom,
  isPlannerRole,
  operationSummary,
  operationTransitionRequiresReason,
  operationVerb,
  OPERATION_STATUSES,
  rollupTarget,
} from "@/lib/scheduling/operation-status";

const ROLES: Role[] = ["ADMIN", "PLANNER", "SUPERVISOR", "VIEWER"];

/** Legal targets per status, independent of role gating (docs/M2_SPEC.md §4). */
const LEGAL: Record<OperationStatus, OperationStatus[]> = {
  QUEUED: ["IN_PROGRESS", "ON_HOLD", "SKIPPED"],
  IN_PROGRESS: ["ON_HOLD", "COMPLETED"],
  ON_HOLD: ["QUEUED", "IN_PROGRESS"],
  COMPLETED: ["IN_PROGRESS"],
  SKIPPED: ["QUEUED"],
};

/** Transitions ADMIN/PLANNER only (skip, reopen). */
const PLANNER_ONLY = new Set(["QUEUED>SKIPPED", "COMPLETED>IN_PROGRESS", "SKIPPED>QUEUED"]);

describe("canTransitionOperation — every pair x role", () => {
  for (const from of OPERATION_STATUSES) {
    for (const to of OPERATION_STATUSES) {
      for (const role of ROLES) {
        const legal = from !== to && LEGAL[from].includes(to);
        const key = `${from}>${to}`;
        const needsOperationsStatus = role !== "VIEWER"; // operations:status: ADMIN, PLANNER, SUPERVISOR
        const plannerOk = !PLANNER_ONLY.has(key) || isPlannerRole(role);
        const expected = legal && needsOperationsStatus && plannerOk;
        it(`${from} -> ${to} as ${role} is ${expected ? "allowed" : "rejected"}`, () => {
          expect(canTransitionOperation(from, to, role)).toBe(expected);
        });
      }
    }
  }

  it("never allows a same-status transition", () => {
    for (const s of OPERATION_STATUSES) expect(canTransitionOperation(s, s, "ADMIN")).toBe(false);
  });
});

describe("allowedOperationTargets", () => {
  it("matches canTransitionOperation for every status/role", () => {
    for (const from of OPERATION_STATUSES) {
      for (const role of ROLES) {
        const targets = allowedOperationTargets(from, role);
        for (const to of OPERATION_STATUSES) {
          expect(targets.includes(to)).toBe(canTransitionOperation(from, to, role));
        }
      }
    }
  });
});

describe("operationTransitionRequiresReason / operationVerb", () => {
  it("only pausing (-> ON_HOLD) requires a reason", () => {
    for (const s of OPERATION_STATUSES) expect(operationTransitionRequiresReason(s)).toBe(s === "ON_HOLD");
  });

  it("labels verbs contextually", () => {
    expect(operationVerb("QUEUED", "IN_PROGRESS")).toBe("started");
    expect(operationVerb("ON_HOLD", "IN_PROGRESS")).toBe("resumed");
    expect(operationVerb("COMPLETED", "IN_PROGRESS")).toBe("reopened");
    expect(operationVerb("IN_PROGRESS", "ON_HOLD")).toBe("paused");
    expect(operationVerb("IN_PROGRESS", "COMPLETED")).toBe("completed");
    expect(operationVerb("QUEUED", "SKIPPED")).toBe("skipped");
    expect(operationVerb("SKIPPED", "QUEUED")).toBe("reopened");
    expect(operationVerb("ON_HOLD", "QUEUED")).toBe("released");
  });
});

describe("operationSummary", () => {
  it("formats the audit summary with and without a reason", () => {
    expect(operationSummary({ machineCode: "CNC-01", orderNumber: "SO-000118", sequence: 10, verb: "started", actorName: "Ravi" })).toBe(
      "CNC-01 · SO-000118 op 10 started by Ravi",
    );
    expect(
      operationSummary({ machineCode: "CNC-01", orderNumber: "SO-000118", sequence: 10, verb: "paused", actorName: "Ravi", reason: "Tool change" }),
    ).toBe("CNC-01 · SO-000118 op 10 paused by Ravi — Tool change");
  });
});

describe("encodeHeldFrom / decodeHeldFrom", () => {
  it("round-trips and rejects garbage", () => {
    const encoded = encodeHeldFrom("IN_PROGRESS", "Order on hold");
    expect(decodeHeldFrom(encoded)).toEqual({ heldFrom: "IN_PROGRESS", reason: "Order on hold", orderHold: true });
    expect(decodeHeldFrom(null)).toBeNull();
    expect(decodeHeldFrom("some free-text reason")).toBeNull();
    expect(decodeHeldFrom('{"not":"it"}')).toBeNull();
  });
});

describe("rollupTarget", () => {
  it("is IN_PROGRESS when any step is IN_PROGRESS", () => {
    expect(rollupTarget([{ status: "COMPLETED" }, { status: "IN_PROGRESS" }, { status: "QUEUED" }])).toBe("IN_PROGRESS");
  });

  it("is COMPLETED when every step is COMPLETED or SKIPPED", () => {
    expect(rollupTarget([{ status: "COMPLETED" }, { status: "SKIPPED" }])).toBe("COMPLETED");
  });

  it("is null when steps are still queued/on hold with nothing in progress", () => {
    expect(rollupTarget([{ status: "QUEUED" }, { status: "ON_HOLD" }])).toBeNull();
  });

  it("is null for an empty step list", () => {
    expect(rollupTarget([])).toBeNull();
  });
});
