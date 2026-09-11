/**
 * Pure positioning/snapping math for the Gantt board (docs/M2_SPEC.md §3). No React, no Date-in/Date-out
 * ambiguity: every instant crosses this module as an ISO string or epoch milliseconds so it is trivial to unit
 * test and never depends on the client's local timezone.
 *
 * `MOVE_SNAP_MINUTES` mirrors `src/lib/scheduling/move.ts` (imported from a dependency-free constants module) so the client's visual snap
 * during a drag always matches what the server will actually persist.
 */
import { MOVE_SNAP_MINUTES } from "@/lib/scheduling/constants";

export { MOVE_SNAP_MINUTES };

/** Bar scale (spec §3 "px per hour"). */
export const PX_PER_HOUR = 40;

const MS_PER_HOUR = 3_600_000;
const MS_PER_MINUTE = 60_000;

/** Total scrollable board width for a window of `days` at `pxPerHour`. */
export function boardWidthPx(days: number, pxPerHour: number = PX_PER_HOUR): number {
  return Math.max(0, days) * 24 * pxPerHour;
}

/** Hours elapsed between two ISO instants (can be negative or fractional). */
export function hoursBetween(fromIso: string, toIso: string): number {
  return (new Date(toIso).getTime() - new Date(fromIso).getTime()) / MS_PER_HOUR;
}

/** Left offset (px) of an instant relative to the window start, at `pxPerHour`. Never negative (clipped to 0). */
export function offsetPx(windowStartIso: string, atIso: string, pxPerHour: number = PX_PER_HOUR): number {
  return Math.max(0, hoursBetween(windowStartIso, atIso) * pxPerHour);
}

/** Bar left position (px) inside the board, relative to the window start. */
export function entryLeftPx(windowStartIso: string, entryStartIso: string, pxPerHour: number = PX_PER_HOUR): number {
  return hoursBetween(windowStartIso, entryStartIso) * pxPerHour;
}

/** Bar width (px); at least 4px so a very short operation is still visible/clickable. */
export function entryWidthPx(entryStartIso: string, entryEndIso: string, pxPerHour: number = PX_PER_HOUR): number {
  return Math.max(4, hoursBetween(entryStartIso, entryEndIso) * pxPerHour);
}

/** Left offset (px) of the Nth day column inside the window. */
export function dayColumnLeftPx(dayIndex: number, pxPerHour: number = PX_PER_HOUR): number {
  return dayIndex * 24 * pxPerHour;
}

/** Pixels-per-day at a given scale — the width of one day header/column. */
export function dayColumnWidthPx(pxPerHour: number = PX_PER_HOUR): number {
  return 24 * pxPerHour;
}

/** A horizontal drag distance in px → minutes (can be negative), at `pxPerHour`. */
export function pxToMinutes(deltaPx: number, pxPerHour: number = PX_PER_HOUR): number {
  return (deltaPx / pxPerHour) * 60;
}

/** Minutes → px at `pxPerHour` (inverse of `pxToMinutes`). */
export function minutesToPx(minutes: number, pxPerHour: number = PX_PER_HOUR): number {
  return (minutes / 60) * pxPerHour;
}

/** Rounds `minutes` to the nearest `snapMinutes` grid (default 15 — spec §3 "horizontal drag snaps to 15 min"). */
export function snapMinutes(minutes: number, snapMinutes: number = MOVE_SNAP_MINUTES): number {
  if (snapMinutes <= 0) return Math.round(minutes);
  return Math.round(minutes / snapMinutes) * snapMinutes;
}

/**
 * Live drag hint: given the pointer's horizontal delta (px) since drag-start, returns the snapped delta in
 * minutes AND its pixel equivalent (for rendering the bar's ghost position while dragging).
 */
export function snapDragDeltaPx(deltaPx: number, pxPerHour: number = PX_PER_HOUR, grid: number = MOVE_SNAP_MINUTES): { minutes: number; px: number } {
  const minutes = snapMinutes(pxToMinutes(deltaPx, pxPerHour), grid);
  return { minutes, px: minutesToPx(minutes, pxPerHour) };
}

/** Applies a minute delta to an ISO instant, returning a new ISO instant (used to build the drop's `plannedStartAt`). */
export function shiftIso(iso: string, deltaMinutes: number): string {
  return new Date(new Date(iso).getTime() + deltaMinutes * MS_PER_MINUTE).toISOString();
}
