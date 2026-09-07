import type { DowntimeType } from "@/generated/prisma/enums";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/** Colour semantics from docs/M1_SPEC.md §5: MAINTENANCE amber, BREAKDOWN red, OTHER gray. */
export const DOWNTIME_TYPE_META: Record<DowntimeType, { label: string; className: string }> = {
  MAINTENANCE: { label: "Maintenance", className: "border-amber-200 bg-amber-50 text-amber-800" },
  BREAKDOWN: { label: "Breakdown", className: "border-red-200 bg-red-50 text-red-700" },
  OTHER: { label: "Other", className: "border-gray-300 bg-gray-100 text-gray-700" },
};

export const DOWNTIME_TYPES = Object.keys(DOWNTIME_TYPE_META) as DowntimeType[];

export function downtimeTypeLabel(type: DowntimeType): string {
  return DOWNTIME_TYPE_META[type].label;
}

export function DowntimeTypeBadge({ type, className }: { type: DowntimeType; className?: string }) {
  const meta = DOWNTIME_TYPE_META[type];
  return (
    <Badge variant="outline" className={cn(meta.className, className)}>
      {meta.label}
    </Badge>
  );
}
