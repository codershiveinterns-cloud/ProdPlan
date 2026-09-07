import type { ReactNode } from "react";
import Link from "next/link";

import type { Role } from "@/generated/prisma/enums";
import { DataTable, type DataTableColumn, type DataTableSort } from "@/components/data/DataTable";
import { DueHint } from "@/components/data/DueHint";
import { PriorityBadge } from "@/components/data/PriorityBadge";
import { StatusBadge } from "@/components/data/StatusBadge";
import { formatDate, formatDateTime, formatQty } from "@/lib/format";
import type { OrderListRow } from "@/lib/orders/list";
import { allowedTargets } from "@/lib/orders/status";
import { can } from "@/lib/rbac";

import { OrderRowMenu } from "./OrderRowMenu";

export type OrdersTableProps = {
  rows: OrderListRow[];
  /** `todayInTz(tenant.timezone)` */
  today: string;
  tz: string;
  role: Role;
  sort?: DataTableSort;
  caption: string;
  emptyState: ReactNode;
  /** Hide the customer column (customer detail page). */
  hideCustomer?: boolean;
};

/** Orders table per docs/M1_SPEC.md §6.1 (column priorities, DueHint, kebab with View / Edit / Change status). */
export function OrdersTable({ rows, today, tz, role, sort, caption, emptyState, hideCustomer = false }: OrdersTableProps) {
  const canEdit = can(role, "orders:write");
  const columns: DataTableColumn<OrderListRow>[] = [
    {
      key: "number",
      header: "Order #",
      priority: 1,
      sortKey: "orderNumber",
      render: (o) => (
        <Link
          href={`/orders/${o.id}`}
          className="font-mono font-medium underline-offset-4 hover:underline focus-visible:rounded-sm focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          {o.orderNumber}
        </Link>
      ),
    },
    ...(hideCustomer
      ? []
      : [
          {
            key: "customer",
            header: "Customer",
            priority: 2 as const,
            sortKey: "customer",
            render: (o: OrderListRow) => (
              <Link href={`/customers/${o.customerId}`} className="underline-offset-4 hover:underline">
                {o.customerName}
              </Link>
            ),
          },
        ]),
    {
      key: "product",
      header: "Product",
      priority: 1,
      sortKey: "product",
      className: "max-w-64",
      render: (o) => (
        <span className="flex min-w-0 items-baseline gap-1.5">
          <span className="font-mono text-xs text-muted-foreground">{o.productSku}</span>
          <span className="truncate">{o.productName}</span>
        </span>
      ),
    },
    {
      key: "quantity",
      header: "Qty",
      priority: 2,
      sortKey: "quantity",
      className: "text-right tabular-nums",
      render: (o) => formatQty(o.quantity, o.productUnit),
    },
    { key: "priority", header: "Priority", priority: 2, sortKey: "priority", render: (o) => <PriorityBadge priority={o.priority} /> },
    {
      key: "due",
      header: "Due",
      priority: 1,
      sortKey: "dueDate",
      render: (o) => (
        <span className="flex flex-col leading-tight">
          <span>{formatDate(o.dueDate)}</span>
          <DueHint dueDate={o.dueDate} today={today} className="text-xs" />
        </span>
      ),
    },
    { key: "status", header: "Status", priority: 1, sortKey: "status", render: (o) => <StatusBadge status={o.status} /> },
    {
      key: "created",
      header: "Created",
      priority: 3,
      sortKey: "createdAt",
      className: "text-muted-foreground",
      render: (o) => formatDateTime(o.createdAt, tz),
    },
    {
      key: "poRef",
      header: "PO ref",
      priority: 3,
      sortKey: "customerPoRef",
      className: "text-muted-foreground",
      render: (o) => o.customerPoRef ?? "—",
    },
    {
      key: "actions",
      header: <span className="sr-only">Actions</span>,
      priority: 1,
      className: "w-12 text-right",
      render: (o) => (
        <OrderRowMenu
          order={{ id: o.id, orderNumber: o.orderNumber, status: o.status }}
          canEdit={canEdit}
          targets={allowedTargets(o.status, role)}
        />
      ),
    },
  ];

  return (
    <DataTable columns={columns} rows={rows} rowKey={(o) => o.id} sort={sort} caption={caption} emptyState={emptyState} />
  );
}
