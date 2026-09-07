import type { Metadata } from "next";
import Link from "next/link";
import { Users } from "lucide-react";

import { DataTable, type DataTableColumn } from "@/components/data/DataTable";
import { DueHint } from "@/components/data/DueHint";
import { EmptyState } from "@/components/data/EmptyState";
import { FilterBar } from "@/components/data/FilterBar";
import { Pagination } from "@/components/data/Pagination";
import { SearchInput } from "@/components/data/SearchInput";
import { PageHeader } from "@/components/layout/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  countActiveCustomerFilters,
  customerListQuery,
  CUSTOMERS_PAGE_SIZE,
  listCustomers,
  parseCustomerListParams,
  type CustomerListRow,
} from "@/lib/customers";
import { todayInTz } from "@/lib/dates";
import { formatDate } from "@/lib/format";
import { requirePagePermission } from "@/lib/orders/guard";
import { can } from "@/lib/rbac";
import { FlashToast } from "@/app/(app)/orders/_components/FlashToast";

import { CustomerRowMenu } from "./_components/CustomerRowMenu";

export const metadata: Metadata = { title: "Customers" };

type SearchParams = Record<string, string | string[] | undefined>;

export default async function CustomersPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const { session, db } = await requirePagePermission("customers:read");
  const params = parseCustomerListParams(await searchParams);
  const today = todayInTz(session.tenant.timezone);
  const { rows, total } = await listCustomers(db, params);
  const listHref = (patch: Partial<typeof params>) => `/customers${customerListQuery({ ...params, ...patch })}`;
  const activeFilters = countActiveCustomerFilters(params);
  const filtered = activeFilters > 0 || params.q !== "";
  const canWrite = can(session.user.role, "customers:write");
  const canCreateOrder = can(session.user.role, "orders:write");

  const columns: DataTableColumn<CustomerListRow>[] = [
    {
      key: "name",
      header: "Name",
      priority: 1,
      sortKey: "name",
      render: (c) => (
        <span className="flex items-center gap-2">
          <Link href={`/customers/${c.id}`} className="font-medium underline-offset-4 hover:underline">
            {c.name}
          </Link>
          {!c.isActive ? <Badge variant="outline">Inactive</Badge> : null}
        </span>
      ),
    },
    { key: "code", header: "Code", priority: 2, sortKey: "code", className: "font-mono text-xs", render: (c) => c.code ?? "—" },
    { key: "email", header: "Email", priority: 3, sortKey: "email", className: "text-muted-foreground", render: (c) => c.email ?? "—" },
    { key: "phone", header: "Phone", priority: 3, className: "text-muted-foreground", render: (c) => c.phone ?? "—" },
    {
      key: "openOrders",
      header: "Open orders",
      priority: 1,
      className: "text-right tabular-nums",
      render: (c) =>
        c.openOrders > 0 ? (
          <Link href={`/orders?customerId=${encodeURIComponent(c.id)}`} className="underline-offset-4 hover:underline">
            {c.openOrders}
          </Link>
        ) : (
          <span className="text-muted-foreground">0</span>
        ),
    },
    {
      key: "nextDue",
      header: "Next due",
      priority: 2,
      render: (c) =>
        c.nextDue ? (
          <span className="flex flex-col leading-tight">
            <span>{formatDate(c.nextDue)}</span>
            <DueHint dueDate={c.nextDue} today={today} className="text-xs" />
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      key: "actions",
      header: <span className="sr-only">Actions</span>,
      priority: 1,
      className: "w-12 text-right",
      render: (c) => <CustomerRowMenu customer={{ id: c.id, name: c.name, isActive: c.isActive }} canWrite={canWrite} canCreateOrder={canCreateOrder} />,
    },
  ];

  return (
    <>
      <FlashToast />
      <PageHeader
        title="Customers"
        description="Who you make things for. Customers are also created on the fly from the order form and CSV import."
        actions={
          canWrite ? (
            <Button asChild>
              <Link href="/customers/new">New customer</Link>
            </Button>
          ) : undefined
        }
      />
      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <SearchInput placeholder="Search name, code, email, phone" defaultValue={params.q} />
        <FilterBar activeCount={activeFilters} clearHref="/customers">
          <label className="flex h-11 items-center gap-2 text-sm">
            <Checkbox name="includeInactive" value="1" defaultChecked={params.includeInactive} /> Include inactive
          </label>
        </FilterBar>
      </div>
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(c) => c.id}
        sort={{ sort: params.sort, dir: params.dir, makeHref: (sort, dir) => listHref({ sort: sort as typeof params.sort, dir, page: 1 }) }}
        caption={`Customers, page ${params.page}, ${rows.length} of ${total}`}
        emptyState={
          filtered ? (
            <EmptyState
              title={params.q ? `No results for “${params.q}”` : "No customers match these filters"}
              action={
                <Button variant="outline" asChild>
                  <Link href="/customers">Clear filters</Link>
                </Button>
              }
            />
          ) : (
            <EmptyState
              icon={Users}
              title="No customers yet"
              description="Add the companies you produce for, or let the order form create them as you go."
              action={
                canWrite ? (
                  <Button asChild>
                    <Link href="/customers/new">New customer</Link>
                  </Button>
                ) : undefined
              }
            />
          )
        }
      />
      <Pagination className="mt-4" page={params.page} pageSize={CUSTOMERS_PAGE_SIZE} total={total} makeHref={(page) => listHref({ page })} />
    </>
  );
}
