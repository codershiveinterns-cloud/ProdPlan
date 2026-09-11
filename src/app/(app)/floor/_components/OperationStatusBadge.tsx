import type { OperationStatus } from "@/generated/prisma/enums";
import { Badge } from "@/components/ui/badge";
import { OPERATION_STATUS_LABELS } from "@/lib/scheduling/operation-status";
import { cn } from "@/lib/utils";

/** Colour semantics mirroring `StatusBadge` (docs/M1_SPEC.md §5): QUEUED slate, IN_PROGRESS blue, ON_HOLD amber, COMPLETED green, SKIPPED gray outline. */
const OPERATION_STATUS_CLASS: Record<OperationStatus, string> = {
  QUEUED: "border-slate-200 bg-slate-100 text-slate-700",
  IN_PROGRESS: "border-blue-200 bg-blue-50 text-blue-700",
  ON_HOLD: "border-amber-200 bg-amber-50 text-amber-800",
  COMPLETED: "border-green-200 bg-green-50 text-green-700",
  SKIPPED: "border-gray-300 bg-transparent text-gray-500",
};

export function OperationStatusBadge({ status, className }: { status: OperationStatus; className?: string }) {
  return (
    <Badge variant="outline" className={cn(OPERATION_STATUS_CLASS[status], className)}>
      {OPERATION_STATUS_LABELS[status]}
    </Badge>
  );
}
