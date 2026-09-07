import type { OrderPriority } from "@/generated/prisma/enums";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/** Colour semantics from docs/M1_SPEC.md §5: LOW gray outline, NORMAL neutral, HIGH orange, URGENT red filled. */
export const ORDER_PRIORITY_META: Record<OrderPriority, { label: string; className: string }> = {
  LOW: { label: "Low", className: "border-gray-300 bg-transparent text-gray-600" },
  NORMAL: { label: "Normal", className: "border-slate-200 bg-slate-100 text-slate-700" },
  HIGH: { label: "High", className: "border-orange-200 bg-orange-50 text-orange-700" },
  URGENT: { label: "Urgent", className: "border-red-600 bg-red-600 text-white" },
};

export const ORDER_PRIORITIES = Object.keys(ORDER_PRIORITY_META) as OrderPriority[];

export function orderPriorityLabel(priority: OrderPriority): string {
  return ORDER_PRIORITY_META[priority].label;
}

export function PriorityBadge({ priority, className }: { priority: OrderPriority; className?: string }) {
  const meta = ORDER_PRIORITY_META[priority];
  return (
    <Badge variant="outline" className={cn(meta.className, className)}>
      {meta.label}
    </Badge>
  );
}
