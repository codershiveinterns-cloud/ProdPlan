import Link from "next/link";
import { Wrench } from "lucide-react";

import { DataTable, type DataTableColumn } from "@/components/data/DataTable";
import { EmptyState } from "@/components/data/EmptyState";
import { Badge } from "@/components/ui/badge";
import type { OperationStatus } from "@/generated/prisma/enums";
import type { TodayFloorRow as TodayFloorRowDto } from "@/lib/dashboard/queries";
import { cn } from "@/lib/utils";

/** Colour semantics match `StatusBadge`/order statuses (docs/M1_SPEC.md §5): QUEUED slate, IN_PROGRESS blue, ON_HOLD amber, COMPLETED green, SKIPPED gray outline. */
const OPERATION_STATUS_META: Record<OperationStatus, { label: string; className: string }> = {
  QUEUED: { label: "Queued", className: "border-slate-200 bg-slate-100 text-slate-700" },
  IN_PROGRESS: { label: "In progress", className: "border-blue-200 bg-blue-50 text-blue-700" },
  ON_HOLD: { label: "On hold", className: "border-amber-200 bg-amber-50 text-amber-800" },
  COMPLETED: { label: "Completed", className: "border-green-200 bg-green-50 text-green-700" },
  SKIPPED: { label: "Skipped", className: "border-gray-300 bg-transparent text-gray-500" },
};

function OperationStatusBadge({ status }: { status: OperationStatus }) {
  const meta = OPERATION_STATUS_META[status];
  return (
    <Badge variant="outline" className={cn(meta.className)}>
      {meta.label}
    </Badge>
  );
}

/** Row DTO with the start time already formatted in the tenant timezone. */
export type TodayFloorRow = TodayFloorRowDto & { plannedStartLabel: string };

/** "Today on the floor" mini-list (docs/M2_SPEC.md §6): today's scheduled operations, by machine, with status. */
export function TodayFloorList({ rows }: { rows: TodayFloorRow[] }) {
  const columns: DataTableColumn<TodayFloorRow>[] = [
    { key: "machine", header: "Machine", priority: 1, className: "font-mono whitespace-nowrap", render: (r) => r.machineCode },
    {
      key: "order",
      header: "Order",
      priority: 1,
      render: (r) => (
        <Link href={`/orders/${r.orderId}`} className="font-mono font-medium underline-offset-4 hover:underline">
          {r.orderNumber}
        </Link>
      ),
    },
    { key: "product", header: "Product", priority: 2, render: (r) => <span className="font-mono">{r.productSku}</span> },
    { key: "start", header: "Starts", priority: 2, className: "whitespace-nowrap", render: (r) => r.plannedStartLabel },
    { key: "status", header: "Status", priority: 1, render: (r) => <OperationStatusBadge status={r.status} /> },
  ];

  return (
    <DataTable
      columns={columns}
      rows={rows}
      rowKey={(r) => r.id}
      caption={`Today's operations, ${rows.length} shown`}
      emptyState={
        <EmptyState
          icon={Wrench}
          size="compact"
          title="Nothing scheduled today"
          description="Run the schedule to plan today's operations across the floor."
        />
      }
    />
  );
}
