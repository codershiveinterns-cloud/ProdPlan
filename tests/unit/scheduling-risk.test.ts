/** Delivery-risk classification boundaries (docs/M2_SPEC.md §2.6, §7). */
import { describe, expect, it } from "vitest";
import { classifyRisk, isRiskEscalation, riskRank } from "@/lib/scheduling/risk";

const TZ = "Asia/Kolkata";
const HORIZON_END = new Date("2026-12-31T18:30:00.000Z"); // 2027-01-01 00:00 IST

describe("classifyRisk", () => {
  it("is LATE when today (tenant tz) is after the due date, regardless of planned end", () => {
    const { risk, reason } = classifyRisk({
      dueDate: "2026-09-01",
      now: new Date("2026-09-11T02:00:00.000Z"),
      tz: TZ,
      hasShortage: false,
      scheduled: true,
      plannedEndAt: new Date("2026-09-02T00:00:00.000Z"),
      horizonEnd: HORIZON_END,
    });
    expect(risk).toBe("LATE");
    expect(reason).toMatch(/Past due/);
  });

  it("is DELAYED when the planned end is after the end of the due date", () => {
    const { risk, reason } = classifyRisk({
      dueDate: "2026-09-11",
      now: new Date("2026-09-01T00:00:00.000Z"),
      tz: TZ,
      hasShortage: false,
      scheduled: true,
      plannedEndAt: new Date("2026-09-13T04:00:00.000Z"), // 2 days after end-of-day IST
      horizonEnd: HORIZON_END,
    });
    expect(risk).toBe("DELAYED");
    expect(reason).toMatch(/after the due date/);
  });

  it("is AT_RISK when the order has a material shortage even though it would otherwise be ON_TRACK", () => {
    const { risk, reason } = classifyRisk({
      dueDate: "2026-12-01",
      now: new Date("2026-09-01T00:00:00.000Z"),
      tz: TZ,
      hasShortage: true,
      shortage: { code: "RM-1", shortBy: 12.5, unit: "kg" },
      scheduled: true,
      plannedEndAt: new Date("2026-09-05T00:00:00.000Z"),
      horizonEnd: HORIZON_END,
    });
    expect(risk).toBe("AT_RISK");
    expect(reason).toMatch(/RM-1/);
  });

  it("is AT_RISK when unscheduled but the due date is inside the horizon", () => {
    const { risk, reason } = classifyRisk({
      dueDate: "2026-10-01",
      now: new Date("2026-09-01T00:00:00.000Z"),
      tz: TZ,
      hasShortage: false,
      scheduled: false,
      horizonEnd: HORIZON_END,
    });
    expect(risk).toBe("AT_RISK");
    expect(reason).toMatch(/horizon/);
  });

  it("is ON_TRACK when unscheduled but the due date is beyond the horizon", () => {
    const { risk } = classifyRisk({
      dueDate: "2028-01-01",
      now: new Date("2026-09-01T00:00:00.000Z"),
      tz: TZ,
      hasShortage: false,
      scheduled: false,
      horizonEnd: HORIZON_END,
    });
    expect(risk).toBe("ON_TRACK");
  });

  it("is AT_RISK when the planned end falls within one working day of the due date", () => {
    const isWorkingDay = (iso: string) => !iso.endsWith("-06") && !iso.endsWith("-07"); // pretend weekend
    const { risk, reason } = classifyRisk({
      dueDate: "2026-09-08", // Tuesday
      now: new Date("2026-09-01T00:00:00.000Z"),
      tz: TZ,
      hasShortage: false,
      scheduled: true,
      // Planned end on the previous working day (2026-09-07, a "weekend" in this fixture is skipped -> 09-04).
      plannedEndAt: new Date("2026-09-07T10:00:00.000Z"),
      horizonEnd: HORIZON_END,
      isWorkingDay,
    });
    expect(risk).toBe("AT_RISK");
    expect(reason).toBeTruthy();
  });

  it("is AT_RISK in the last 10% of the remaining lead time even on a normal weekday", () => {
    const { risk } = classifyRisk({
      dueDate: "2026-09-11",
      now: new Date("2026-09-10T18:00:00.000Z"), // ~a few hours before end-of-day IST
      tz: TZ,
      hasShortage: false,
      scheduled: true,
      plannedEndAt: new Date("2026-09-11T18:00:00.000Z"),
      horizonEnd: HORIZON_END,
    });
    expect(risk).toBe("AT_RISK");
  });

  it("is ON_TRACK comfortably ahead of the due date with no shortage", () => {
    const { risk, reason } = classifyRisk({
      dueDate: "2026-12-01",
      now: new Date("2026-09-01T00:00:00.000Z"),
      tz: TZ,
      hasShortage: false,
      scheduled: true,
      plannedEndAt: new Date("2026-09-05T00:00:00.000Z"),
      horizonEnd: HORIZON_END,
    });
    expect(risk).toBe("ON_TRACK");
    expect(reason).toBeNull();
  });
});

describe("riskRank / isRiskEscalation", () => {
  it("ranks ON_TRACK < AT_RISK < DELAYED < LATE", () => {
    expect(riskRank("ON_TRACK")).toBeLessThan(riskRank("AT_RISK"));
    expect(riskRank("AT_RISK")).toBeLessThan(riskRank("DELAYED"));
    expect(riskRank("DELAYED")).toBeLessThan(riskRank("LATE"));
  });

  it("is an escalation only when moving to a strictly worse, non-ON_TRACK risk", () => {
    expect(isRiskEscalation("ON_TRACK", "AT_RISK")).toBe(true);
    expect(isRiskEscalation("AT_RISK", "DELAYED")).toBe(true);
    expect(isRiskEscalation("DELAYED", "AT_RISK")).toBe(false);
    expect(isRiskEscalation("AT_RISK", "AT_RISK")).toBe(false);
    expect(isRiskEscalation("DELAYED", "ON_TRACK")).toBe(false);
  });
});
