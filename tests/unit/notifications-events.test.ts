/**
 * Unit: event builders (src/lib/notifications/events.ts) — recipients, types, hrefs and dedupe keys per
 * docs/M2_SPEC.md §5.
 */
import { describe, expect, it } from "vitest";
import {
  conflictDedupeKey,
  conflictDetected,
  deliveryRiskChanged,
  materialShortage,
  operationStatusChanged,
  orderStatusChanged,
  riskDedupeKey,
  SCHEDULE_RUN_DEDUPE_KEY,
  scheduleRunFinished,
} from "@/lib/notifications/events";

const base = { tenantId: "t1", actorUserId: "u-actor" };

describe("scheduleRunFinished", () => {
  it("notifies ADMIN + PLANNER with counts, links to /schedule and excludes the actor", () => {
    const input = scheduleRunFinished({ ...base, runId: "run1", orderCount: 18, conflictCount: 3 });
    expect(input).toMatchObject({
      tenantId: "t1",
      recipients: { roles: ["ADMIN", "PLANNER"] },
      type: "SCHEDULE_RUN",
      title: "Schedule updated",
      body: "18 orders scheduled, 3 conflicts",
      href: "/schedule",
      entityType: "ScheduleRun",
      entityId: "run1",
      dedupeKey: SCHEDULE_RUN_DEDUPE_KEY,
      excludeUserId: "u-actor",
    });
    expect(scheduleRunFinished({ tenantId: "t1", orderCount: 1, conflictCount: 1 }).body).toBe("1 order scheduled, 1 conflict");
    expect(scheduleRunFinished({ tenantId: "t1", orderCount: 0, conflictCount: 0 }).excludeUserId).toBeNull();
  });
});

describe("conflictDetected", () => {
  it("uses conflict:<type>:<orderId> for order-bound conflicts", () => {
    const input = conflictDetected({
      ...base,
      conflictType: "DEADLINE_MISSED",
      subject: { orderId: "o1", orderNumber: "SO-000001" },
      message: "Finishes 2 d after the due date",
    });
    expect(input.type).toBe("SCHEDULE_CONFLICT");
    expect(input.dedupeKey).toBe("conflict:DEADLINE_MISSED:o1");
    expect(input.href).toBe("/schedule/conflicts");
    expect(input.title).toBe("Deadline missed: SO-000001");
    expect(input.body).toBe("Finishes 2 d after the due date");
    expect(input.entityType).toBe("Order");
    expect(input.entityId).toBe("o1");
    expect(input.recipients.roles).toEqual(["ADMIN", "PLANNER"]);
  });

  it("uses the machine id for machine conflicts and the material id (with MATERIAL_SHORTAGE type) for shortages", () => {
    const machine = conflictDetected({
      ...base,
      conflictType: "MACHINE_OVERLOAD",
      subject: { machineId: "m1", machineCode: "CNC-01" },
      message: "Overloaded on 12 Sep",
    });
    expect(machine.dedupeKey).toBe("conflict:MACHINE_OVERLOAD:m1");
    expect(machine.title).toBe("Machine overloaded: CNC-01");

    const material = conflictDetected({
      ...base,
      conflictType: "MATERIAL_SHORTAGE",
      subject: { materialId: "mat1", materialCode: "AL-6061" },
      message: "Short by 12 kg",
    });
    expect(material.type).toBe("MATERIAL_SHORTAGE");
    expect(material.dedupeKey).toBe(conflictDedupeKey("MATERIAL_SHORTAGE", "mat1"));
  });
});

describe("materialShortage", () => {
  it("shares the conflict dedupe key with conflictDetected so the two never double-notify", () => {
    const input = materialShortage({ ...base, materialId: "mat1", materialCode: "AL-6061", materialName: "Aluminium bar", shortfall: "12.5 kg", orderNumbers: ["SO-1", "SO-2"] });
    expect(input.type).toBe("MATERIAL_SHORTAGE");
    expect(input.dedupeKey).toBe("conflict:MATERIAL_SHORTAGE:mat1");
    expect(input.href).toBe("/schedule/conflicts");
    expect(input.title).toBe("Material shortage: AL-6061 Aluminium bar");
    expect(input.body).toBe("Short by 12.5 kg, affects 2 orders");
    expect(materialShortage({ ...base, materialId: "m", materialCode: "C", materialName: "N" }).body).toBe(
      "Not enough stock to cover the scheduled orders",
    );
  });
});

describe("deliveryRiskChanged", () => {
  it("notifies for AT_RISK / DELAYED / LATE with risk:<orderId>:<risk> and the order href", () => {
    for (const risk of ["AT_RISK", "DELAYED", "LATE"] as const) {
      const input = deliveryRiskChanged({ ...base, orderId: "o1", orderNumber: "SO-000001", risk, dueDate: "12 Sep 2026" });
      expect(input).not.toBeNull();
      expect(input?.type).toBe("DELIVERY_RISK");
      expect(input?.dedupeKey).toBe(riskDedupeKey("o1", risk));
      expect(input?.dedupeKey).toBe(`risk:o1:${risk}`);
      expect(input?.href).toBe("/orders/o1");
      expect(input?.recipients.roles).toEqual(["ADMIN", "PLANNER"]);
    }
    expect(deliveryRiskChanged({ ...base, orderId: "o1", orderNumber: "SO-000001", risk: "LATE" })?.title).toBe("Order SO-000001 is late");
  });

  it("returns null for ON_TRACK", () => {
    expect(deliveryRiskChanged({ ...base, orderId: "o1", orderNumber: "SO-000001", risk: "ON_TRACK" })).toBeNull();
  });
});

describe("orderStatusChanged", () => {
  it("goes to ADMIN + PLANNER, plus SUPERVISOR for ON_HOLD / IN_PROGRESS", () => {
    const hold = orderStatusChanged({ ...base, actorName: "Priya", orderId: "o1", orderNumber: "SO-000001", from: "QUEUED", to: "ON_HOLD", reason: "Tooling" });
    expect(hold.recipients.roles).toEqual(["ADMIN", "PLANNER", "SUPERVISOR"]);
    expect(hold.title).toBe("Order SO-000001 is now on hold");
    expect(hold.body).toBe("Priya changed it from queued — Tooling");
    expect(hold.href).toBe("/orders/o1");
    expect(hold.dedupeKey).toBe("order-status:o1:ON_HOLD");
    expect(hold.excludeUserId).toBe("u-actor");

    const started = orderStatusChanged({ ...base, orderId: "o1", orderNumber: "SO-000001", from: "QUEUED", to: "IN_PROGRESS" });
    expect(started.recipients.roles).toContain("SUPERVISOR");
    expect(started.body).toBe("Someone changed it from queued");

    const done = orderStatusChanged({ ...base, orderId: "o1", orderNumber: "SO-000001", from: "IN_PROGRESS", to: "COMPLETED" });
    expect(done.recipients.roles).toEqual(["ADMIN", "PLANNER"]);
  });
});

describe("operationStatusChanged", () => {
  it("dedupes per entry + status and links to /floor", () => {
    const input = operationStatusChanged({
      ...base,
      actorName: "Ravi",
      entryId: "e1",
      orderId: "o1",
      orderNumber: "SO-000001",
      operationName: "Cutting",
      machineCode: "CNC-01",
      status: "IN_PROGRESS",
    });
    expect(input.type).toBe("OPERATION_STATUS");
    expect(input.dedupeKey).toBe("operation:e1:IN_PROGRESS");
    expect(input.href).toBe("/floor");
    expect(input.title).toBe("Cutting started: SO-000001");
    expect(input.body).toBe("Ravi started Cutting on CNC-01 for order SO-000001");
    expect(input.recipients.roles).toEqual(["ADMIN", "PLANNER"]);
    expect(input.entityType).toBe("ScheduleEntry");
    expect(input.entityId).toBe("e1");

    expect(operationStatusChanged({ ...base, entryId: "e1", orderId: "o1", orderNumber: "SO-1", operationName: "Cutting", status: "ON_HOLD" }).title).toBe("Cutting paused: SO-1");
    expect(operationStatusChanged({ ...base, entryId: "e1", orderId: "o1", orderNumber: "SO-1", operationName: "Cutting", status: "COMPLETED" }).dedupeKey).toBe("operation:e1:COMPLETED");
  });
});
