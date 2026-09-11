import { describe, expect, it } from "vitest";
import { placeWork } from "@/lib/scheduling/windows";

const H = 60 * 60_000;
const at = (hours: number): number => hours * H;

describe("placeWork — blocking (docs/M2_SPEC.md §2.3, regression for the same-machine straddle bug)", () => {
  it("without blocking, freely bridges a non-working gap (existing, unchanged behaviour)", () => {
    // free: [0,2)  gap  [4,8) — 3 hours of work bridges the 2h gap.
    const free = [{ s: at(0), e: at(2) }, { s: at(4), e: at(8) }];
    const p = placeWork(free, at(0), 180);
    expect(p).toEqual({ start: at(0), end: at(5) });
  });

  it("with a blocking interval spanning the gap, does NOT bridge — restarts on the far side", () => {
    // Same free windows, but the gap [2,4) is occupied by another order's job (not just non-working time).
    const free = [{ s: at(0), e: at(2) }, { s: at(4), e: at(8) }];
    const blocking = [{ s: at(2), e: at(4) }];
    const p = placeWork(free, at(0), 180, blocking);
    // Must not straddle [2,4): the whole 3h must come from the second window alone.
    expect(p).toEqual({ start: at(4), end: at(7) });
  });

  it("reproduces the exact fixed-machine-then-any-machine scenario without an overlap", () => {
    // Order A (fixed machine) already committed 06:56–09:26 (state.occupied). Order B needs 57 min on the same
    // machine; its calendar-free windows (ignoring A) would be [06:00,10:00) — a single contiguous block — but A's
    // occupied slot splits it into two usable slivers around A. B must never persist a window that overlaps A's.
    const dayStart = new Date("2026-09-14T00:00:00.000Z").getTime();
    const free = [{ s: dayStart, e: dayStart + 12 * H }]; // 00:00–12:00 calendar-free (simplified)
    const occupiedByA = [{ s: dayStart + 6.9333 * H, e: dayStart + 9.4333 * H }]; // 06:56–09:26
    const bFree = free
      .flatMap((w) => [{ s: w.s, e: occupiedByA[0]!.s }, { s: occupiedByA[0]!.e, e: w.e }])
      .filter((w) => w.e > w.s);
    const p = placeWork(bFree, dayStart + 6.3667 * H, 57, occupiedByA);
    expect(p).not.toBeNull();
    // Must start at or after A's end (09:26), never inside [06:56, 09:26).
    expect(p!.start).toBeGreaterThanOrEqual(occupiedByA[0]!.e);
  });
});
