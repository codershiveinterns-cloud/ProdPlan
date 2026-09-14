/**
 * `RiskCause` classification (docs/M3_SPEC.md §2): every branch of `riskCauseFor()` plus the precedence rule via
 * `classifyRisk()`'s `cause` field (MATERIAL > UPSTREAM_DELAY > CAPACITY > NONE — a shortage always wins even when
 * the order is ALSO upstream-delayed).
 */
import { describe, expect, it } from "vitest";
import { classifyRisk, riskCauseFor, RISK_CAUSE_LABELS, UPSTREAM_DELAY_THRESHOLD_MINUTES } from "@/lib/scheduling/risk";

const TZ = "Asia/Kolkata";
const HORIZON_END = new Date("2026-12-31T18:30:00.000Z"); // 2027-01-01 00:00 IST
const NOW = new Date("2026-09-01T00:00:00.000Z");

describe("riskCauseFor", () => {
  it("is MATERIAL whenever there is a shortage, regardless of risk level or upstream delay", () => {
    expect(riskCauseFor("AT_RISK", true, false)).toBe("MATERIAL");
    expect(riskCauseFor("AT_RISK", true, true)).toBe("MATERIAL");
    expect(riskCauseFor("DELAYED", true, true)).toBe("MATERIAL");
  });

  it("is UPSTREAM_DELAY when there is no shortage but a fixed entry is running behind plan", () => {
    expect(riskCauseFor("DELAYED", false, true)).toBe("UPSTREAM_DELAY");
    expect(riskCauseFor("AT_RISK", false, true)).toBe("UPSTREAM_DELAY");
  });

  it("is CAPACITY for any other non-ON_TRACK risk", () => {
    expect(riskCauseFor("AT_RISK", false, false)).toBe("CAPACITY");
    expect(riskCauseFor("DELAYED", false, false)).toBe("CAPACITY");
    expect(riskCauseFor("LATE", false, false)).toBe("CAPACITY");
  });

  it("is NONE for ON_TRACK", () => {
    expect(riskCauseFor("ON_TRACK", false, false)).toBe("NONE");
  });

  it("precedence: MATERIAL beats UPSTREAM_DELAY beats CAPACITY", () => {
    expect(riskCauseFor("LATE", true, true)).toBe("MATERIAL");
    expect(riskCauseFor("LATE", false, true)).toBe("UPSTREAM_DELAY");
    expect(riskCauseFor("LATE", false, false)).toBe("CAPACITY");
  });
});

describe("RISK_CAUSE_LABELS", () => {
  it("has a label for every cause", () => {
    expect(RISK_CAUSE_LABELS.NONE).toBe("—");
    expect(RISK_CAUSE_LABELS.MATERIAL).toMatch(/material/i);
    expect(RISK_CAUSE_LABELS.CAPACITY).toMatch(/capacity/i);
    expect(RISK_CAUSE_LABELS.UPSTREAM_DELAY).toMatch(/upstream/i);
  });
});

describe("classifyRisk — cause field", () => {
  const base = { dueDate: "2026-12-01", now: NOW, tz: TZ, scheduled: true, horizonEnd: HORIZON_END };

  it("is MATERIAL when hasShortage even though the order is also upstream-delayed", () => {
    const result = classifyRisk({
      ...base,
      hasShortage: true,
      shortage: { code: "RM-1", shortBy: 5, unit: "kg" },
      hasUpstreamDelay: true,
      plannedEndAt: new Date("2026-09-05T00:00:00.000Z"),
    });
    expect(result.risk).toBe("AT_RISK");
    expect(result.cause).toBe("MATERIAL");
  });

  it("is UPSTREAM_DELAY when at risk with no shortage but an upstream delay", () => {
    const result = classifyRisk({
      ...base,
      dueDate: "2026-09-11",
      hasShortage: false,
      hasUpstreamDelay: true,
      plannedEndAt: new Date("2026-09-13T04:00:00.000Z"), // DELAYED
    });
    expect(result.risk).toBe("DELAYED");
    expect(result.cause).toBe("UPSTREAM_DELAY");
  });

  it("is CAPACITY when not ON_TRACK with no shortage and no upstream delay", () => {
    const result = classifyRisk({
      ...base,
      dueDate: "2026-09-11",
      hasShortage: false,
      hasUpstreamDelay: false,
      plannedEndAt: new Date("2026-09-13T04:00:00.000Z"), // DELAYED
    });
    expect(result.risk).toBe("DELAYED");
    expect(result.cause).toBe("CAPACITY");
  });

  it("is NONE when ON_TRACK", () => {
    const result = classifyRisk({
      ...base,
      hasShortage: false,
      hasUpstreamDelay: false,
      plannedEndAt: new Date("2026-09-05T00:00:00.000Z"),
    });
    expect(result.risk).toBe("ON_TRACK");
    expect(result.cause).toBe("NONE");
  });

  it("defaults hasUpstreamDelay to false when omitted", () => {
    const result = classifyRisk({
      ...base,
      dueDate: "2026-09-11",
      hasShortage: false,
      plannedEndAt: new Date("2026-09-13T04:00:00.000Z"),
    });
    expect(result.cause).toBe("CAPACITY");
  });
});

describe("UPSTREAM_DELAY_THRESHOLD_MINUTES", () => {
  it("is 60 per docs/M3_SPEC.md §2", () => {
    expect(UPSTREAM_DELAY_THRESHOLD_MINUTES).toBe(60);
  });
});
