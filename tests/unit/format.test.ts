import { describe, expect, it } from "vitest";
import {
  formatDate,
  formatDateTime,
  formatDays,
  formatInt,
  formatMinutes,
  formatNumber,
  formatPercent,
  formatQty,
  formatRelative,
  formatSignedQty,
  formatTime,
  toNumberLike,
} from "@/lib/format";

const IST = "Asia/Kolkata";

describe("formatDate", () => {
  it("renders ISO dates and UTC-midnight Dates as `05 Sep 2026`", () => {
    expect(formatDate("2026-09-05")).toBe("05 Sep 2026");
    expect(formatDate(new Date("2026-09-05T00:00:00.000Z"))).toBe("05 Sep 2026");
    expect(formatDate("2026-01-01")).toBe("01 Jan 2026");
    expect(formatDate("2026-12-25")).toBe("25 Dec 2026");
  });

  it("falls back to the UTC day for full timestamps and returns '' for empty/invalid", () => {
    expect(formatDate("2026-09-05T23:59:00.000Z")).toBe("05 Sep 2026");
    expect(formatDate(null)).toBe("");
    expect(formatDate(undefined)).toBe("");
    expect(formatDate("")).toBe("");
    expect(formatDate("not a date")).toBe("");
    expect(formatDate(new Date("nope"))).toBe("");
  });
});

describe("formatDateTime / formatTime", () => {
  it("renders in the tenant timezone with a 24 h clock", () => {
    const d = new Date("2026-09-05T09:00:00.000Z");
    expect(formatDateTime(d, IST)).toBe("05 Sep 2026, 14:30");
    expect(formatDateTime(d.toISOString(), IST)).toBe("05 Sep 2026, 14:30");
    expect(formatDateTime(d.getTime(), "UTC")).toBe("05 Sep 2026, 09:00");
    expect(formatDateTime(new Date("2026-09-05T20:00:00.000Z"), IST)).toBe("06 Sep 2026, 01:30");
    expect(formatTime(d, IST)).toBe("14:30");
    expect(formatTime(new Date("2026-09-05T00:05:00.000Z"), "UTC")).toBe("00:05");
  });

  it("returns '' for empty, invalid values or an invalid zone", () => {
    expect(formatDateTime(null, IST)).toBe("");
    expect(formatDateTime("garbage", IST)).toBe("");
    expect(formatDateTime(new Date(), "Nope/Zone")).toBe("");
    expect(formatTime(undefined, IST)).toBe("");
  });
});

describe("formatRelative", () => {
  const now = new Date("2026-09-05T12:00:00.000Z");

  it("uses just now / min / h / d buckets", () => {
    expect(formatRelative(now, now)).toBe("just now");
    expect(formatRelative(new Date("2026-09-05T11:59:30.000Z"), now)).toBe("just now");
    expect(formatRelative(new Date("2026-09-05T11:55:00.000Z"), now)).toBe("5 min ago");
    expect(formatRelative(new Date("2026-09-05T11:00:00.000Z"), now)).toBe("1 h ago");
    expect(formatRelative(new Date("2026-09-05T10:00:00.000Z"), now)).toBe("2 h ago");
    expect(formatRelative(new Date("2026-09-04T12:00:00.000Z"), now)).toBe("1 d ago");
    expect(formatRelative(new Date("2026-09-02T12:00:00.000Z"), now)).toBe("3 d ago");
  });

  it("handles future instants", () => {
    expect(formatRelative(new Date("2026-09-05T14:00:00.000Z"), now)).toBe("in 2 h");
    expect(formatRelative(new Date("2026-09-05T12:10:00.000Z"), now)).toBe("in 10 min");
  });

  it("falls back to an absolute date after 7 days (tenant tz when given)", () => {
    const old = new Date("2026-08-20T09:00:00.000Z");
    expect(formatRelative(old, now)).toBe("20 Aug 2026");
    expect(formatRelative(old, now, IST)).toBe("20 Aug 2026, 14:30");
    expect(formatRelative("garbage", now)).toBe("");
  });
});

describe("numbers and quantities", () => {
  it("formatNumber groups thousands and trims to 3 dp", () => {
    expect(formatNumber(5400)).toBe("5,400");
    expect(formatNumber(1234.5678)).toBe("1,234.568");
    expect(formatNumber("12.500")).toBe("12.5");
    expect(formatNumber(0)).toBe("0");
    expect(formatNumber({ toString: () => "2.750" })).toBe("2.75");
    expect(formatNumber(null)).toBe("");
    expect(formatNumber("abc")).toBe("");
    expect(formatNumber(2.5, 0)).toBe("3");
  });

  it("formatInt rounds and groups", () => {
    expect(formatInt(5400)).toBe("5,400");
    expect(formatInt(382.5)).toBe("383");
    expect(formatInt("900")).toBe("900");
    expect(formatInt(undefined)).toBe("");
  });

  it("formatQty appends the unit", () => {
    expect(formatQty("12.500", "kg")).toBe("12.5 kg");
    expect(formatQty(250, "pcs")).toBe("250 pcs");
    expect(formatQty(250)).toBe("250");
    expect(formatQty(250, "  ")).toBe("250");
    expect(formatQty(1000.1234, "m")).toBe("1,000.123 m");
    expect(formatQty(null, "kg")).toBe("");
  });

  it("formatSignedQty uses explicit signs", () => {
    expect(formatSignedQty(12.5, "kg")).toBe("+12.5 kg");
    expect(formatSignedQty(-3, "kg")).toBe("−3 kg");
    expect(formatSignedQty("0", "kg")).toBe("+0 kg");
    expect(formatSignedQty(null)).toBe("");
  });

  it("formatMinutes renders human durations", () => {
    expect(formatMinutes(0)).toBe("0 min");
    expect(formatMinutes(45)).toBe("45 min");
    expect(formatMinutes(60)).toBe("1 h");
    expect(formatMinutes(90)).toBe("1 h 30 min");
    expect(formatMinutes(450)).toBe("7 h 30 min");
    expect(formatMinutes(5400)).toBe("90 h");
    expect(formatMinutes(-5)).toBe("0 min");
    expect(formatMinutes("120")).toBe("2 h");
    expect(formatMinutes(null)).toBe("0 min");
  });

  it("formatPercent / formatDays / toNumberLike", () => {
    expect(formatPercent(85)).toBe("85%");
    expect(formatPercent("12.34")).toBe("12.3%");
    expect(formatPercent(null)).toBe("");
    expect(formatDays(3)).toBe("3d");
    expect(formatDays(-3)).toBe("3d");
    expect(toNumberLike("  7.5 ")).toBe(7.5);
    expect(Number.isNaN(toNumberLike(""))).toBe(true);
    expect(Number.isNaN(toNumberLike(undefined))).toBe(true);
  });
});
