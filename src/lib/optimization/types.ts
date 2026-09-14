/**
 * AI-assisted schedule optimization types (docs/M3_SPEC.md §3). `generateSuggestions()` (suggest.ts) is pure and
 * in-memory — it never touches the database — so `Suggestion` carries the routing `sequence` (for
 * REASSIGN_MACHINE) instead of a persisted `ScheduleEntry.id`; the caller that persists a generated batch
 * (`src/lib/optimization/generate.ts`) resolves that to the live entry id (or `null` when none exists yet).
 */
import type { OrderPriority, SuggestionKind } from "@/generated/prisma/enums";

export const SUGGESTION_KIND_LABELS: Record<SuggestionKind, string> = {
  REASSIGN_MACHINE: "Reassign machine",
  REPRIORITIZE: "Raise priority",
};

export type Suggestion = {
  kind: SuggestionKind;
  orderId: string;
  orderNumber: string;
  /** REASSIGN_MACHINE only: the routing step sequence being reassigned. */
  sequence: number | null;
  fromMachineId: string | null;
  fromMachineCode: string | null;
  toMachineId: string | null;
  toMachineCode: string | null;
  fromPriority: OrderPriority | null;
  toPriority: OrderPriority | null;
  /** Open conflicts in the baseline (whole plan), for display context — not specific to this order. */
  currentConflicts: number;
  /** Open conflicts if this suggestion were applied. */
  projectedConflicts: number;
  /** Total late-minutes across the whole plan in the baseline. */
  currentLateMinutes: number;
  /** Total late-minutes across the whole plan if this suggestion were applied. */
  projectedLateMinutes: number;
  /** e.g. "Reassign SO-000042 op 20 to CNC-03". */
  summary: string;
  /** Plain-English: what changes and why it helps. */
  rationale: string;
};
