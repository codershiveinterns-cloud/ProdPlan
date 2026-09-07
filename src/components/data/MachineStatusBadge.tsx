import type { DowntimeType, MachineStatus } from "@/generated/prisma/enums";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

import { downtimeTypeLabel } from "./DowntimeTypeBadge";

/** Colour semantics from docs/M1_SPEC.md §5: ACTIVE green, INACTIVE gray, MAINTENANCE amber. */
export const MACHINE_STATUS_META: Record<MachineStatus, { label: string; className: string }> = {
  ACTIVE: { label: "Active", className: "border-green-200 bg-green-50 text-green-700" },
  INACTIVE: { label: "Inactive", className: "border-gray-300 bg-gray-100 text-gray-600" },
  MAINTENANCE: { label: "Maintenance", className: "border-amber-200 bg-amber-50 text-amber-800" },
};

export const MACHINE_STATUSES = Object.keys(MACHINE_STATUS_META) as MachineStatus[];

export function machineStatusLabel(status: MachineStatus): string {
  return MACHINE_STATUS_META[status].label;
}

export type ActiveDowntime = {
  type: DowntimeType;
  /** Pre-formatted end time in the tenant timezone, e.g. "12:00" (formatting happens in Server Components). */
  until: string;
};

/**
 * Machine availability flag, plus (when `activeDowntime` is given) the red "Down · Maintenance until 12:00"
 * badge for a window covering now.
 */
export function MachineStatusBadge({
  status,
  activeDowntime,
  className,
}: {
  status: MachineStatus;
  activeDowntime?: ActiveDowntime | null;
  className?: string;
}) {
  const meta = MACHINE_STATUS_META[status];
  return (
    <span className={cn("inline-flex flex-wrap items-center gap-1.5", className)}>
      <Badge variant="outline" className={meta.className}>
        {meta.label}
      </Badge>
      {activeDowntime ? (
        <Badge variant="outline" className="border-red-200 bg-red-50 text-red-700">
          Down · {downtimeTypeLabel(activeDowntime.type)} until {activeDowntime.until}
        </Badge>
      ) : null}
    </span>
  );
}
