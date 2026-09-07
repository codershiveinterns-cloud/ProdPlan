import { describe, expect, it } from "vitest";
import { DEFAULT_TIMEZONE, isValidTimeZone, timeZoneLabel, timeZoneOffsetLabel, timeZoneOptions } from "@/lib/auth/timezones";

describe("timezone options", () => {
  it("contains the default and modern IANA names, sorted and unique", () => {
    const list = timeZoneOptions();
    expect(list).toContain(DEFAULT_TIMEZONE);
    expect(list).toContain("UTC");
    expect(list).toContain("Europe/London");
    expect(list).not.toContain("Asia/Calcutta");
    expect(new Set(list).size).toBe(list.length);
    expect([...list].sort((a, b) => a.localeCompare(b))).toEqual(list);
    expect(list.length).toBeGreaterThan(300);
  });

  it("validates any zone Intl understands, including legacy aliases", () => {
    expect(isValidTimeZone("Asia/Kolkata")).toBe(true);
    expect(isValidTimeZone("Asia/Calcutta")).toBe(true);
    expect(isValidTimeZone("UTC")).toBe(true);
    expect(isValidTimeZone("Mars/Olympus")).toBe(false);
    expect(isValidTimeZone("")).toBe(false);
    expect(isValidTimeZone(42)).toBe(false);
  });

  it("formats offsets for display", () => {
    const at = new Date("2026-09-05T00:00:00Z");
    expect(timeZoneOffsetLabel("Asia/Kolkata", at)).toBe("UTC+05:30");
    expect(timeZoneOffsetLabel("UTC", at)).toBe("UTC+00:00");
    expect(timeZoneLabel("Asia/Kolkata", at)).toBe("Asia/Kolkata (UTC+05:30)");
    expect(timeZoneOffsetLabel("Nope/Zone", at)).toBe("");
  });
});
