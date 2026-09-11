import Link from "next/link";
import { ClipboardList } from "lucide-react";

import { DataTable, type DataTableColumn } from "@/components/data/DataTable";
import { DueHint, dueHint } from "@/components/data/DueHint";
import { EmptyState } from "@/components/data/EmptyState";
import { PriorityBadge } from "@/components/data/PriorityBadge";
import { StatusBadge } from "@/components/data/StatusBadge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { DeliveryRisk } from "@/generated/prisma/enums";
import type { DashboardOrderRow } from "@/lib/dashboard/queries";
import { cn } from "@/lib/utils";

/** Colour semantics for delivery risk (docs/M2_SPEC.md §6): ON_TRACK slate, AT_RISK amber, DELAYED orange, LATE red. */
const DELIVERY_RISK_META: Record<DeliveryRisk, { label: string; className: string }> = {
  ON_TRACK: { label: "On track", className: "border-slate-200 bg-slate-100 text-slate-700" },
  AT_RISK: { label: "At risk", className: "border-amber-200 bg-amber-50 text-amber-800" },
  DELAYED: { label: "Delayed", className: "border-orange-200 bg-orange-50 text-orange-800" },
  LATE: { label: "Late", className: "border-red-200 bg-red-50 text-red-700" },
};

export function RiskBadge({ risk, className }: { risk: DeliveryRisk; className?: string }) {
  const meta = DELIVERY_RISK_META[risk];
  return (
    <Badge variant="outline" className={cn(meta.className, className)}>
      {meta.label}
    </Badge>
  );
}

/** Row DTO with the strings the Server Component page already formatted. */
export type OrdersDueRow = DashboardOrderRow & { quantityLabel: string; dueDateLabel: string };

export function OrdersDueTable({ rows, today, canCreate }: { rows: OrdersDueRow[]; today: string; canCreate: boolean }) {
  const columns: DataTableColumn<OrdersDueRow>[] = [
    {
      key: "number",
      header: "Order #",
      priority: 1,
      render: (o) => (
        <Link href={`/orders/${o.id}`} className="font-mono font-medium underline-offset-4 hover:underline">
          {o.orderNumber}
        </Link>
      ),
    },
    { key: "customer", header: "Customer", priority: 2, render: (o) => <span className="block max-w-40 truncate">{o.customerName}</span> },
    {
      key: "product",
      header: "Product",
      priority: 1,
      render: (o) => (
        <span className="block max-w-52 truncate">
          <span className="font-mono">{o.productSku}</span>
          <span className="text-muted-foreground"> · {o.productName}</span>
        </span>
      ),
    },
    { key: "qty", header: "Qty", priority: 2, className: "text-right whitespace-nowrap", render: (o) => o.quantityLabel },
    {
      key: "due",
      header: "Due",
      priority: 1,
      className: "whitespace-nowrap",
      render: (o) => (
        <span className="flex flex-col leading-tight">
          <span>{o.dueDateLabel}</span>
          <DueHint dueDate={o.dueDate} today={today} className="text-xs" />
        </span>
      ),
    },
    { key: "priority", header: "Priority", priority: 3, render: (o) => <PriorityBadge priority={o.priority} /> },
    { key: "status", header: "Status", priority: 1, render: (o) => <StatusBadge status={o.status} /> },
    { key: "risk", header: "Risk", priority: 2, render: (o) => <RiskBadge risk={o.deliveryRisk} /> },
  ];

  return (
    <DataTable
      columns={columns}
      rows={rows}
      rowKey={(o) => o.id}
      rowClassName={(o) => (dueHint(o.dueDate, today).tone === "overdue" ? "bg-red-50/70 hover:bg-red-50" : undefined)}
      caption={`Open orders by due date, ${rows.length} shown`}
      emptyState={
        <EmptyState
          icon={ClipboardList}
          size="compact"
          title="No open orders"
          description="New orders appear here sorted by due date, overdue first."
          action={
            canCreate ? (
              <>
                <Button asChild>
                  <Link href="/orders/new">New order</Link>
                </Button>
                <Button variant="outline" asChild>
                  <Link href="/orders/import">Import CSV</Link>
                </Button>
              </>
            ) : undefined
          }
        />
      }
    />
  );
}
