/**
 * `OperationStatus` colour semantics for the board/drawer (docs/M2_SPEC.md §3, M1_SPEC.md §5 colour semantics):
 * QUEUED slate, IN_PROGRESS blue, ON_HOLD amber, COMPLETED green — the SAME Tailwind token families
 * `src/components/data/StatusBadge.tsx` uses for `OrderStatus`, extended here for the operation enum (SKIPPED is
 * the one value `OrderStatus` has no counterpart for; it gets the same neutral treatment as CANCELLED there).
 */
import type { ConflictSeverity, ConflictType, OperationStatus } from "@/generated/prisma/enums";

export const OPERATION_STATUS_META: Record<OperationStatus, { label: string; className: string; barClassName: string }> = {
  QUEUED: { label: "Queued", className: "border-slate-200 bg-slate-100 text-slate-700", barClassName: "border-slate-300 bg-slate-200 text-slate-800" },
  IN_PROGRESS: { label: "In progress", className: "border-blue-200 bg-blue-50 text-blue-700", barClassName: "border-blue-300 bg-blue-500 text-white" },
  ON_HOLD: { label: "On hold", className: "border-amber-200 bg-amber-50 text-amber-800", barClassName: "border-amber-300 bg-amber-400 text-amber-950" },
  COMPLETED: { label: "Completed", className: "border-green-200 bg-green-50 text-green-700", barClassName: "border-green-300 bg-green-500 text-white" },
  SKIPPED: { label: "Skipped", className: "border-gray-300 bg-transparent text-gray-500", barClassName: "border-gray-300 bg-gray-300 text-gray-700" },
};

export function operationStatusLabel(status: OperationStatus): string {
  return OPERATION_STATUS_META[status].label;
}

/** Conflict severity — WARNING amber, CRITICAL red (spec §3 `/schedule/conflicts`). */
export const CONFLICT_SEVERITY_META: Record<ConflictSeverity, { label: string; className: string }> = {
  WARNING: { label: "Warning", className: "border-amber-200 bg-amber-50 text-amber-800" },
  CRITICAL: { label: "Critical", className: "border-red-300 bg-red-50 text-red-700" },
};

export const CONFLICT_TYPE_LABELS: Record<ConflictType, string> = {
  MACHINE_OVERLOAD: "Machine overload",
  MACHINE_UNAVAILABLE: "Machine unavailable",
  MATERIAL_SHORTAGE: "Material shortage",
  DEADLINE_AT_RISK: "Deadline at risk",
  DEADLINE_MISSED: "Deadline missed",
  NO_ROUTING: "No routing",
  NO_MACHINE: "No machine",
  UNSCHEDULED: "Unscheduled",
};
