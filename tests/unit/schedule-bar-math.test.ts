import { describe, expect, it } from "vitest";
import {
  boardWidthPx,
  dayColumnLeftPx,
  entryLeftPx,
  entryWidthPx,
  hoursBetween,
  minutesToPx,
  MOVE_SNAP_MINUTES,
  offsetPx,
  PX_PER_HOUR,
  pxToMinutes,
  shiftIso,
  snapDragDeltaPx,
  snapMinutes,
} from "@/components/schedule/bar-math";

describe("bar-math: pure positioning helpers", () => {
  it("boardWidthPx is days * 24 * pxPerHour", () => {
    expect(boardWidthPx(14)).toBe(14 * 24 * PX_PER_HOUR);
    expect(boardWidthPx(7, 20)).toBe(7 * 24 * 20);
    expect(boardWidthPx(-1)).toBe(0);
  });

  it("hoursBetween handles fractional and negative differences", () => {
    expect(hoursBetween("2026-09-11T00:00:00.000Z", "2026-09-11T06:00:00.000Z")).toBe(6);
    expect(hoursBetween("2026-09-11T06:00:00.000Z", "2026-09-11T00:00:00.000Z")).toBe(-6);
    expect(hoursBetween("2026-09-11T00:00:00.000Z", "2026-09-11T00:30:00.000Z")).toBe(0.5);
  });

  it("entryLeftPx positions an entry relative to the window start", () => {
    const windowStart = "2026-09-11T00:00:00.000Z";
    expect(entryLeftPx(windowStart, "2026-09-11T08:00:00.000Z")).toBe(8 * PX_PER_HOUR);
    expect(entryLeftPx(windowStart, "2026-09-12T08:00:00.000Z")).toBe(32 * PX_PER_HOUR);
  });

  it("entryWidthPx enforces a visible minimum width", () => {
    expect(entryWidthPx("2026-09-11T08:00:00.000Z", "2026-09-11T12:00:00.000Z")).toBe(4 * PX_PER_HOUR);
    expect(entryWidthPx("2026-09-11T08:00:00.000Z", "2026-09-11T08:00:00.100Z")).toBe(4);
  });

  it("offsetPx clips instants before the window start to 0", () => {
    expect(offsetPx("2026-09-11T00:00:00.000Z", "2026-09-10T00:00:00.000Z")).toBe(0);
    expect(offsetPx("2026-09-11T00:00:00.000Z", "2026-09-11T02:00:00.000Z")).toBe(2 * PX_PER_HOUR);
  });

  it("dayColumnLeftPx steps by a full day width", () => {
    expect(dayColumnLeftPx(0)).toBe(0);
    expect(dayColumnLeftPx(3)).toBe(3 * 24 * PX_PER_HOUR);
  });

  it("pxToMinutes / minutesToPx are inverses at a given scale", () => {
    expect(pxToMinutes(PX_PER_HOUR)).toBe(60);
    expect(pxToMinutes(PX_PER_HOUR / 2)).toBe(30);
    expect(minutesToPx(60)).toBe(PX_PER_HOUR);
    expect(minutesToPx(pxToMinutes(123))).toBeCloseTo(123, 10);
  });

  it("snapMinutes rounds to the 15-min grid by default", () => {
    expect(snapMinutes(7)).toBe(0);
    expect(snapMinutes(8)).toBe(15);
    expect(snapMinutes(22)).toBe(15);
    expect(snapMinutes(23)).toBe(30);
    expect(snapMinutes(-8)).toBe(-15);
    expect(MOVE_SNAP_MINUTES).toBe(15);
  });

  it("snapMinutes honours a custom grid and a zero grid falls back to whole minutes", () => {
    expect(snapMinutes(40, 30)).toBe(30);
    expect(snapMinutes(3.6, 0)).toBe(4);
  });

  it("snapDragDeltaPx returns both the snapped minutes and their pixel equivalent", () => {
    const { minutes, px } = snapDragDeltaPx(PX_PER_HOUR / 4 + 2); // ~17 min -> snaps to 15
    expect(minutes).toBe(15);
    expect(px).toBe(minutesToPx(15));
  });

  it("shiftIso adds a minute delta to an ISO instant", () => {
    expect(shiftIso("2026-09-11T08:00:00.000Z", 90)).toBe("2026-09-11T09:30:00.000Z");
    expect(shiftIso("2026-09-11T08:00:00.000Z", -30)).toBe("2026-09-11T07:30:00.000Z");
  });
});
