/**
 * Client-safe scheduling constants. This module has zero imports (in particular, no `@/lib/audit`/`@/lib/db`
 * chain) so both server code (`move.ts`) and client components (`components/schedule/bar-math.ts`) can share one
 * source of truth without pulling server-only modules (which use `next/headers`) into a client bundle.
 */

/** Horizontal drag snaps to this grid (docs/M2_SPEC.md §3). */
export const MOVE_SNAP_MINUTES = 15;
