/**
 * Pure constants shared between the module's Server Actions and its Client Components (this file has no server
 * imports, so client bundles can use it safely).
 */

/** The field key the DowntimeDialog watches for the non-blocking overlap warning ("Save anyway"). */
export const CONFIRM_OVERLAP_FIELD = "confirmOverlap";

/** The field key dialogs use for shift-set validation messages (overlap, net minutes, days). */
export const SHIFTS_FIELD = "shifts";

/** Class for native `<select>`s in filter bars (matches the 44 px SelectTrigger look). */
export const NATIVE_SELECT_CLASS =
  "h-11 w-full rounded-lg border border-input bg-card px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:bg-muted disabled:opacity-60 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:w-auto md:min-w-44";
