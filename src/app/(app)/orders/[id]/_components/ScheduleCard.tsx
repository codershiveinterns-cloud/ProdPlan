import Link from "next/link";
import { CalendarClock } from "lucide-react";

import { DeliveryRiskBadge } from "@/components/data/DeliveryRiskBadge";
import { EmptyState } from "@/components/data/EmptyState";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toDateOnly } from "@/lib/dates";
import { formatDateTime, formatQty, formatTime } from "@/lib/format";
import type { OrderScheduleDTO } from "@/lib/scheduling/queries";

import { OperationStatusBadge } from "@/app/(app)/floor/_components/OperationStatusBadge";

export type ScheduleCardProps = {
  schedule: OrderScheduleDTO;
  tz: string;
  productUnit: string;
};

/**
 * Order detail "Schedule" card (docs/M2_SPEC.md §3): steps table (sequence, work center, machine, planned window,
 * status, quantity done vs order quantity), the delivery risk badge + reason, and an "Open on board" link. Handles
 * the not-yet-scheduled case with an EmptyState.
 */
export function ScheduleCard({ schedule, tz, productUnit }: ScheduleCardProps) {
  const boardHref = (() => {
    if (!schedule || schedule.steps.length === 0) return "/schedule";
    const first = schedule.steps[0]!;
    const from = toDateOnly(new Date(first.plannedStartAt));
    return `/schedule?from=${from}&workCenterId=${encodeURIComponent(first.workCenterId)}`;
  })();

  return (
    <Card className="py-0 gap-0">
      <CardHeader className="py-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle>Schedule</CardTitle>
            <CardDescription>Planned steps and delivery risk from the production schedule.</CardDescription>
          </div>
          {schedule ? (
            <div className="flex flex-col items-end gap-1">
              <DeliveryRiskBadge risk={schedule.deliveryRisk} />
              {schedule.riskReason ? (
                <span className="max-w-64 text-right text-xs text-muted-foreground">{schedule.riskReason}</span>
              ) : null}
            </div>
          ) : null}
        </div>
      </CardHeader>
      <div className="border-t">
        {!schedule || schedule.steps.length === 0 ? (
          <EmptyState
            icon={CalendarClock}
            size="compact"
            title="Not yet scheduled"
            description="Run the schedule from the planning board to place this order on a machine."
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs font-medium tracking-wide text-muted-foreground uppercase">
                    <th className="px-4 py-2">Seq</th>
                    <th className="px-4 py-2">Work center</th>
                    <th className="px-4 py-2">Machine</th>
                    <th className="px-4 py-2">Planned window</th>
                    <th className="px-4 py-2">Status</th>
                    <th className="px-4 py-2 text-right">Done</th>
                  </tr>
                </thead>
                <tbody>
                  {schedule.steps.map((step) => (
                    <tr key={step.id} className="border-b last:border-0">
                      <td className="px-4 py-2 tabular-nums">{step.sequence}</td>
                      <td className="px-4 py-2">{step.workCenterName}</td>
                      <td className="px-4 py-2">
                        <span className="font-mono text-xs text-muted-foreground">{step.machineCode}</span>{" "}
                        {step.machineName}
                      </td>
                      <td className="px-4 py-2 whitespace-nowrap text-muted-foreground">
                        {formatDateTime(step.plannedStartAt, tz)} – {formatTime(step.plannedEndAt, tz)}
                      </td>
                      <td className="px-4 py-2">
                        <OperationStatusBadge status={step.status} />
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums">{formatQty(step.quantityDone, productUnit)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between gap-2 px-4 py-3">
              <span className="text-sm text-muted-foreground">
                {schedule.plannedStartAt && schedule.plannedEndAt
                  ? `${formatDateTime(schedule.plannedStartAt, tz)} – ${formatDateTime(schedule.plannedEndAt, tz)}`
                  : null}
              </span>
              <Link href={boardHref} className="text-sm underline-offset-4 hover:underline">
                Open on board
              </Link>
            </div>
          </>
        )}
      </div>
    </Card>
  );
}
