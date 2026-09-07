import type { OrderStatus } from "@/generated/prisma/enums";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/** Colour semantics from docs/M1_SPEC.md §5: QUEUED slate, IN_PROGRESS blue, ON_HOLD amber, COMPLETED green, CANCELLED gray outline. */
export const ORDER_STATUS_META: Record<OrderStatus, { label: string; className: string }> = {
  QUEUED: { label: "Queued", className: "border-slate-200 bg-slate-100 text-slate-700" },
  IN_PROGRESS: { label: "In progress", className: "border-blue-200 bg-blue-50 text-blue-700" },
  ON_HOLD: { label: "On hold", className: "border-amber-200 bg-amber-50 text-amber-800" },
  COMPLETED: { label: "Completed", className: "border-green-200 bg-green-50 text-green-700" },
  CANCELLED: { label: "Cancelled", className: "border-gray-300 bg-transparent text-gray-500" },
};

export const ORDER_STATUSES = Object.keys(ORDER_STATUS_META) as OrderStatus[];

export function orderStatusLabel(status: OrderStatus): string {
  return ORDER_STATUS_META[status].label;
}

export function StatusBadge({ status, className }: { status: OrderStatus; className?: string }) {
  const meta = ORDER_STATUS_META[status];
  return (
    <Badge variant="outline" className={cn(meta.className, className)}>
      {meta.label}
    </Badge>
  );
}
