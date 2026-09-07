import { describe, expect, it } from "vitest";
import type { OrderStatus, Role } from "@/generated/prisma/enums";
import {
  allowedTargets,
  canTransition,
  completedAtFor,
  editableFields,
  isFieldEditable,
  isOrderStatus,
  isReopen,
  isTerminal,
  ORDER_EDITABLE_FIELDS,
  ORDER_STATUSES,
  TERMINAL_STATUSES,
  transitionAcceptsReason,
  transitionNeedsConfirmation,
  transitionRequiresReason,
  transitionSummary,
} from "@/lib/orders/status";

const ROLES: Role[] = ["ADMIN", "PLANNER", "SUPERVISOR", "VIEWER"];

/** The legal transitions per docs/M1_SPEC.md §4, per role. */
const LEGAL: Record<Role, Record<OrderStatus, OrderStatus[]>> = {
  ADMIN: {
    QUEUED: ["IN_PROGRESS", "ON_HOLD", "CANCELLED"],
    IN_PROGRESS: ["ON_HOLD", "COMPLETED", "CANCELLED"],
    ON_HOLD: ["QUEUED", "IN_PROGRESS", "CANCELLED"],
    COMPLETED: ["IN_PROGRESS"],
    CANCELLED: ["QUEUED"],
  },
  PLANNER: {
    QUEUED: ["IN_PROGRESS", "ON_HOLD", "CANCELLED"],
    IN_PROGRESS: ["ON_HOLD", "COMPLETED", "CANCELLED"],
    ON_HOLD: ["QUEUED", "IN_PROGRESS", "CANCELLED"],
    COMPLETED: [],
    CANCELLED: [],
  },
  SUPERVISOR: {
    QUEUED: ["IN_PROGRESS", "ON_HOLD"],
    IN_PROGRESS: ["ON_HOLD", "COMPLETED"],
    ON_HOLD: ["QUEUED", "IN_PROGRESS"],
    COMPLETED: [],
    CANCELLED: [],
  },
  VIEWER: { QUEUED: [], IN_PROGRESS: [], ON_HOLD: [], COMPLETED: [], CANCELLED: [] },
};

describe("canTransition — every (from, to, role) triple", () => {
  for (const role of ROLES) {
    for (const from of ORDER_STATUSES) {
      for (const to of ORDER_STATUSES) {
        const expected = LEGAL[role][from].includes(to);
        it(`${role}: ${from} → ${to} is ${expected ? "allowed" : "rejected"}`, () => {
          expect(canTransition(from, to, role)).toBe(expected);
        });
      }
    }
  }

  it("rejects unknown statuses defensively", () => {
    expect(canTransition("QUEUED", "BOGUS" as OrderStatus, "ADMIN")).toBe(false);
    expect(canTransition("BOGUS" as OrderStatus, "QUEUED", "ADMIN")).toBe(false);
  });
});

describe("allowedTargets", () => {
  it("matches the matrix in canonical order", () => {
    for (const role of ROLES) {
      for (const from of ORDER_STATUSES) {
        expect(allowedTargets(from, role)).toEqual(LEGAL[role][from]);
      }
    }
  });
});

describe("terminal / reopen helpers", () => {
  it("identifies terminal statuses and reopens", () => {
    expect(TERMINAL_STATUSES).toEqual(["COMPLETED", "CANCELLED"]);
    expect(isTerminal("COMPLETED")).toBe(true);
    expect(isTerminal("CANCELLED")).toBe(true);
    expect(isTerminal("ON_HOLD")).toBe(false);
    expect(isReopen("COMPLETED", "IN_PROGRESS")).toBe(true);
    expect(isReopen("CANCELLED", "QUEUED")).toBe(true);
    expect(isReopen("COMPLETED", "QUEUED")).toBe(false);
    expect(isReopen("QUEUED", "IN_PROGRESS")).toBe(false);
    expect(isOrderStatus("QUEUED")).toBe(true);
    expect(isOrderStatus("queued")).toBe(false);
    expect(isOrderStatus(null)).toBe(false);
  });

  it("reason and confirmation rules", () => {
    expect(transitionRequiresReason("ON_HOLD")).toBe(true);
    expect(transitionRequiresReason("CANCELLED")).toBe(false);
    expect(transitionRequiresReason("COMPLETED")).toBe(false);
    expect(transitionAcceptsReason("ON_HOLD")).toBe(true);
    expect(transitionAcceptsReason("CANCELLED")).toBe(true);
    expect(transitionAcceptsReason("IN_PROGRESS")).toBe(false);
    expect(transitionNeedsConfirmation("COMPLETED")).toBe(true);
    expect(transitionNeedsConfirmation("CANCELLED")).toBe(true);
    expect(transitionNeedsConfirmation("ON_HOLD")).toBe(false);
  });

  it("completedAtFor sets, clears or leaves completedAt", () => {
    const now = new Date("2026-09-05T10:00:00.000Z");
    expect(completedAtFor("IN_PROGRESS", "COMPLETED", now)).toBe(now);
    expect(completedAtFor("COMPLETED", "IN_PROGRESS", now)).toBeNull();
    expect(completedAtFor("CANCELLED", "QUEUED", now)).toBeNull();
    expect(completedAtFor("QUEUED", "IN_PROGRESS", now)).toBeUndefined();
    expect(completedAtFor("IN_PROGRESS", "CANCELLED", now)).toBeUndefined();
  });

  it("transitionSummary is the audit text", () => {
    expect(transitionSummary("SO-000123", "IN_PROGRESS", "COMPLETED")).toBe("Order SO-000123 status IN_PROGRESS → COMPLETED");
  });
});

describe("editableFields", () => {
  it("QUEUED: everything is editable", () => {
    expect([...editableFields("QUEUED")].sort()).toEqual([...ORDER_EDITABLE_FIELDS].sort());
  });

  it("IN_PROGRESS / ON_HOLD: identity fields lock", () => {
    for (const status of ["IN_PROGRESS", "ON_HOLD"] as const) {
      const f = editableFields(status);
      expect(f.has("customerId")).toBe(false);
      expect(f.has("productId")).toBe(false);
      expect(f.has("orderNumber")).toBe(false);
      expect([...f].sort()).toEqual(["customerPoRef", "dueDate", "earliestStartDate", "notes", "priority", "quantity"]);
    }
  });

  it("terminal: only notes", () => {
    expect([...editableFields("COMPLETED")]).toEqual(["notes"]);
    expect([...editableFields("CANCELLED")]).toEqual(["notes"]);
    expect(isFieldEditable("COMPLETED", "quantity")).toBe(false);
    expect(isFieldEditable("COMPLETED", "notes")).toBe(true);
    expect(isFieldEditable("QUEUED", "orderNumber")).toBe(true);
    expect(isFieldEditable("ON_HOLD", "orderNumber")).toBe(false);
  });
});
