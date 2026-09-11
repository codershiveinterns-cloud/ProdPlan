/** Scheduling (docs/M2_SPEC.md §2–§4): run options, drag-to-reschedule, operation transitions, conflict filters. */
import { z } from "zod";
import { ConflictSeverity, ConflictType, OperationStatus } from "@/generated/prisma/enums";
import { MAX_HORIZON_DAYS } from "@/lib/scheduling/engine";
import { enumField, idField, intField, isoDateTimeField, optionalNumberField, optionalText } from "./common";

/** `schedule:run` — horizon override, 1–365 days; blank uses `Tenant.scheduleHorizonDays`. */
export const runScheduleSchema = z.object({
  horizonDays: intField("Horizon (days)", { min: 1, max: MAX_HORIZON_DAYS }).optional(),
});
export type RunScheduleInput = z.output<typeof runScheduleSchema>;

/** `schedule:move` — drag-to-reschedule drop. */
export const moveEntrySchema = z.object({
  entryId: idField("operation"),
  machineId: idField("machine"),
  plannedStartAt: isoDateTimeField("Planned start"),
});
export type MoveEntryFormInput = z.output<typeof moveEntrySchema>;

export const unlockEntrySchema = z.object({
  entryId: idField("operation"),
});
export type UnlockEntryFormInput = z.output<typeof unlockEntrySchema>;

/** `operations:status` — floor transition (start/pause/resume/complete/skip/reopen). */
export const operationTransitionSchema = z
  .object({
    entryId: idField("operation"),
    to: enumField(OperationStatus, "Select a status"),
    quantityDone: optionalNumberField("Quantity done", { min: 0, decimals: 3 }),
    note: optionalText("Note", { max: 500 }),
    reason: optionalText("Reason", { max: 300 }),
    overridePrevious: z.preprocess((v) => v === "on" || v === "true" || v === true, z.boolean().optional()),
  })
  .transform((v) => ({ ...v, overridePrevious: v.overridePrevious === true }));
export type OperationTransitionFormInput = z.output<typeof operationTransitionSchema>;

/** `/schedule/conflicts` list filters. */
export const conflictListFiltersSchema = z.object({
  type: enumField(ConflictType, "Invalid conflict type").optional(),
  severity: enumField(ConflictSeverity, "Invalid severity").optional(),
  /** `undefined` = both; `true` = resolved only; `false` = open only. */
  resolved: z
    .preprocess((v) => (v === "" || v === undefined ? undefined : v === "1" || v === "true" || v === true), z.boolean().optional()),
  page: z.preprocess((v) => {
    const n = Number.parseInt(String(v ?? ""), 10);
    return Number.isFinite(n) && n > 0 ? n : 1;
  }, z.number().int().min(1)),
});
export type ConflictListFilters = z.output<typeof conflictListFiltersSchema>;

/** Board window query (`?from=&days=&workCenterId=`). */
export const BOARD_WINDOW_DAY_OPTIONS = [7, 14, 30] as const;
export const boardWindowSchema = z.object({
  from: z.iso.date({ error: "Invalid date" }),
  days: z.preprocess((v) => {
    const n = Number.parseInt(String(v ?? ""), 10);
    return (BOARD_WINDOW_DAY_OPTIONS as readonly number[]).includes(n) ? n : 14;
  }, z.number().int()),
  workCenterId: z.preprocess((v) => (v === "" ? undefined : v), idField("work center").optional()),
});
export type BoardWindowParams = z.output<typeof boardWindowSchema>;
