import { afterEach, describe, expect, it, vi } from "vitest";
import {
  addDays,
  compareDateOnly,
  diffDays,
  endOfDayInTz,
  formatHHMM,
  fromDateOnly,
  isIsoDate,
  isValidTimeZone,
  parseDateOnly,
  parseHHMM,
  startOfDayInTz,
  toDateOnly,
  todayInTz,
  todayPlusInTz,
  utcToZonedParts,
  weekdayOf,
  zonedToUtc,
} from "@/lib/dates";

const IST = "Asia/Kolkata";

describe("todayInTz", () => {
  afterEach(() => vi.useRealTimers());

  it("returns the previous UTC day's successor for Asia/Kolkata at 01:00 local", () => {
    vi.useFakeTimers();
    // 2026-09-04 19:30Z == 2026-09-05 01:00 IST
    vi.setSystemTime(new Date("2026-09-04T19:30:00.000Z"));
    expect(todayInTz(IST)).toBe("2026-09-05");
    expect(todayInTz("UTC")).toBe("2026-09-04");
    expect(todayInTz("America/Los_Angeles")).toBe("2026-09-04");
  });

  it("handles the other direction (late evening in a western zone)", () => {
    vi.useFakeTimers();
    // 2026-09-05 03:00Z == 2026-09-04 20:00 Los Angeles
    vi.setSystemTime(new Date("2026-09-05T03:00:00.000Z"));
    expect(todayInTz("America/Los_Angeles")).toBe("2026-09-04");
    expect(todayInTz(IST)).toBe("2026-09-05");
  });

  it("accepts an explicit `now` and rejects invalid time zones", () => {
    expect(todayInTz(IST, new Date("2026-12-31T18:30:00.000Z"))).toBe("2027-01-01");
    expect(todayInTz(IST, Date.UTC(2026, 0, 1, 18, 29))).toBe("2026-01-01");
    expect(() => todayInTz("Not/AZone")).toThrow(RangeError);
    expect(() => todayInTz("")).toThrow(RangeError);
  });

  it("todayPlusInTz adds days in the tenant zone", () => {
    expect(todayPlusInTz(IST, 7, new Date("2026-09-04T19:30:00.000Z"))).toBe("2026-09-12");
    expect(todayPlusInTz(IST, -1, new Date("2026-09-04T19:30:00.000Z"))).toBe("2026-09-04");
  });
});

describe("isValidTimeZone", () => {
  it("accepts IANA names Intl knows and rejects junk", () => {
    expect(isValidTimeZone("Asia/Kolkata")).toBe(true);
    expect(isValidTimeZone("UTC")).toBe(true);
    expect(isValidTimeZone("Europe/Berlin")).toBe(true);
    expect(isValidTimeZone("Mars/Olympus")).toBe(false);
    expect(isValidTimeZone("")).toBe(false);
    expect(isValidTimeZone(null)).toBe(false);
    expect(isValidTimeZone(42)).toBe(false);
  });
});

describe("date-only helpers", () => {
  it("fromDateOnly returns UTC midnight and toDateOnly reverses it", () => {
    const d = fromDateOnly("2026-09-05");
    expect(d.toISOString()).toBe("2026-09-05T00:00:00.000Z");
    expect(toDateOnly(d)).toBe("2026-09-05");
    expect(toDateOnly(new Date("2026-02-28T00:00:00.000Z"))).toBe("2026-02-28");
  });

  it("parseDateOnly rejects malformed and impossible dates", () => {
    expect(parseDateOnly("2026-09-05")).toEqual({ year: 2026, month: 9, day: 5 });
    expect(() => parseDateOnly("2026-9-5")).toThrow(RangeError);
    expect(() => parseDateOnly("2026-13-01")).toThrow(RangeError);
    expect(() => parseDateOnly("2026-02-30")).toThrow(RangeError);
    expect(() => parseDateOnly("05/09/2026")).toThrow(RangeError);
    expect(() => parseDateOnly("")).toThrow(RangeError);
    expect(() => fromDateOnly("2026-04-31")).toThrow(RangeError);
    expect(() => toDateOnly(new Date("nope"))).toThrow(RangeError);
  });

  it("isIsoDate is a boolean guard", () => {
    expect(isIsoDate("2024-02-29")).toBe(true);
    expect(isIsoDate("2026-02-29")).toBe(false);
    expect(isIsoDate("2026-09-05T00:00:00Z")).toBe(false);
    expect(isIsoDate(undefined)).toBe(false);
  });

  it("addDays and diffDays work across month/year boundaries and leap days", () => {
    expect(addDays("2026-09-05", 7)).toBe("2026-09-12");
    expect(addDays("2026-09-30", 1)).toBe("2026-10-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-01-01", -1)).toBe("2025-12-31");
    expect(addDays("2024-02-28", 1)).toBe("2024-02-29");
    expect(addDays("2026-09-05", 0)).toBe("2026-09-05");
    expect(diffDays("2026-09-05", "2026-09-12")).toBe(7);
    expect(diffDays("2026-09-12", "2026-09-05")).toBe(-7);
    expect(diffDays("2026-09-05", "2026-09-05")).toBe(0);
    expect(diffDays("2025-12-31", "2026-01-01")).toBe(1);
    expect(() => addDays("2026-09-05", Number.NaN)).toThrow(RangeError);
  });

  it("compareDateOnly and weekdayOf", () => {
    expect(compareDateOnly("2026-09-05", "2026-09-06")).toBe(-1);
    expect(compareDateOnly("2026-09-06", "2026-09-05")).toBe(1);
    expect(compareDateOnly("2026-09-05", "2026-09-05")).toBe(0);
    expect(() => compareDateOnly("bad", "2026-09-05")).toThrow(RangeError);
    expect(weekdayOf("2026-09-05")).toBe(6); // Saturday
    expect(weekdayOf("2026-09-06")).toBe(0); // Sunday
    expect(weekdayOf("2026-09-07")).toBe(1); // Monday
  });
});

describe("HH:MM helpers", () => {
  it("parseHHMM parses 24 h times and rejects everything else", () => {
    expect(parseHHMM("00:00")).toBe(0);
    expect(parseHHMM("09:30")).toBe(570);
    expect(parseHHMM("23:59")).toBe(1439);
    expect(() => parseHHMM("24:00")).toThrow(RangeError);
    expect(() => parseHHMM("9:30")).toThrow(RangeError);
    expect(() => parseHHMM("09:60")).toThrow(RangeError);
    expect(() => parseHHMM("0930")).toThrow(RangeError);
    expect(() => parseHHMM("")).toThrow(RangeError);
  });

  it("formatHHMM pads and wraps", () => {
    expect(formatHHMM(0)).toBe("00:00");
    expect(formatHHMM(570)).toBe("09:30");
    expect(formatHHMM(1500)).toBe("01:00");
    expect(formatHHMM(-30)).toBe("23:30");
  });
});

describe("zonedToUtc / utcToZonedParts", () => {
  it("converts IST wall-clock to UTC and back", () => {
    const d = zonedToUtc("2026-09-07", "06:00", IST);
    expect(d.toISOString()).toBe("2026-09-07T00:30:00.000Z");
    expect(utcToZonedParts(d, IST)).toEqual({ date: "2026-09-07", time: "06:00" });
    expect(utcToZonedParts("2026-09-07T00:30:00.000Z", IST)).toEqual({ date: "2026-09-07", time: "06:00" });
    expect(utcToZonedParts(d.getTime(), "UTC")).toEqual({ date: "2026-09-07", time: "00:30" });
  });

  it("midnight in IST is the previous UTC evening", () => {
    expect(zonedToUtc("2026-09-07", "00:00", IST).toISOString()).toBe("2026-09-06T18:30:00.000Z");
    expect(startOfDayInTz("2026-09-07", IST).toISOString()).toBe("2026-09-06T18:30:00.000Z");
    expect(endOfDayInTz("2026-09-07", IST).toISOString()).toBe("2026-09-07T18:30:00.000Z");
  });

  it("respects DST in zones that have it", () => {
    // Berlin: +02:00 in summer, +01:00 in winter
    expect(zonedToUtc("2026-07-01", "12:00", "Europe/Berlin").toISOString()).toBe("2026-07-01T10:00:00.000Z");
    expect(zonedToUtc("2026-01-15", "12:00", "Europe/Berlin").toISOString()).toBe("2026-01-15T11:00:00.000Z");
    expect(utcToZonedParts("2026-07-01T10:00:00.000Z", "Europe/Berlin")).toEqual({ date: "2026-07-01", time: "12:00" });
  });

  it("validates its inputs", () => {
    expect(() => zonedToUtc("2026-09-07", "25:00", IST)).toThrow(RangeError);
    expect(() => zonedToUtc("2026-13-07", "06:00", IST)).toThrow(RangeError);
    expect(() => zonedToUtc("2026-09-07", "06:00", "Nope/Zone")).toThrow(RangeError);
    expect(() => utcToZonedParts("garbage", IST)).toThrow(RangeError);
  });
});
