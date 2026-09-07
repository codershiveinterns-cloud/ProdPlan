import Link from "next/link";
import { ClipboardList } from "lucide-react";

import { DataTable, type DataTableColumn } from "@/components/data/DataTable";
import { DueHint, dueHint } from "@/components/data/DueHint";
import { EmptyState } from "@/components/data/EmptyState";
import { PriorityBadge } from "@/components/data/PriorityBadge";
import { StatusBadge } from "@/components/data/StatusBadge";
import { Button } from "@/components/ui/button";
import type { DashboardOrderRow } from "@/lib/dashboard/queries";

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
