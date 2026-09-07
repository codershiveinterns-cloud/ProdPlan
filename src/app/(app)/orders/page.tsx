import type { Metadata } from "next";
import Link from "next/link";
import { ClipboardList, Upload, X } from "lucide-react";

import { EmptyState } from "@/components/data/EmptyState";
import { Pagination } from "@/components/data/Pagination";
import { SearchInput } from "@/components/data/SearchInput";
import { PageHeader } from "@/components/layout/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { todayInTz } from "@/lib/dates";
import { listCustomerOptions } from "@/lib/customers";
import { requirePagePermission } from "@/lib/orders/guard";
import { countActiveOrderFilters, listOrders, orderListQuery, ORDERS_PAGE_SIZE, parseOrderListParams, toOrderSortKey } from "@/lib/orders/list";
import { can } from "@/lib/rbac";

import { FlashToast } from "./_components/FlashToast";
import { OrdersFilters } from "./_components/OrdersFilters";
import { OrdersTable } from "./_components/OrdersTable";

export const metadata: Metadata = { title: "Orders" };

type SearchParams = Record<string, string | string[] | undefined>;

export default async function OrdersPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const { session, db } = await requirePagePermission("orders:read");
  const params = parseOrderListParams(await searchParams);
  const today = todayInTz(session.tenant.timezone);
  const [{ rows, total }, customers] = await Promise.all([listOrders(db, params), listCustomerOptions(db)]);
  const listHref = (patch: Partial<typeof params>) => `/orders${orderListQuery({ ...params, ...patch })}`;
  const activeFilters = countActiveOrderFilters(params);
  const filtered = activeFilters > 0 || params.q !== "";
  const canWrite = can(session.user.role, "orders:write");

  return (
    <>
      <FlashToast />
      <PageHeader
        title="Orders"
        description="Customer orders and their production status."
        actions={
          canWrite ? (
            <>
              <Button variant="outline" asChild>
                <Link href="/orders/import">
                  <Upload data-icon="inline-start" />
                  Import CSV
                </Link>
              </Button>
              <Button asChild>
                <Link href="/orders/new">New order</Link>
              </Button>
            </>
          ) : undefined
        }
      />
      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <SearchInput placeholder="Search order #, customer, SKU, PO ref" defaultValue={params.q} />
        <OrdersFilters params={params} customers={customers} />
      </div>
      {params.batch ? (
        <div className="mb-3 flex items-center gap-2 text-sm text-muted-foreground">
          <Badge variant="secondary">Showing one CSV import</Badge>
          <Link href={listHref({ batch: "", page: 1 })} className="inline-flex items-center gap-1 underline-offset-4 hover:underline">
            <X className="size-3.5" aria-hidden="true" />
            Show all orders
          </Link>
        </div>
      ) : null}
      <OrdersTable
        rows={rows}
        today={today}
        tz={session.tenant.timezone}
        role={session.user.role}
        sort={{ sort: params.sort, dir: params.dir, makeHref: (sort, dir) => listHref({ sort: toOrderSortKey(sort), dir, page: 1 }) }}
        caption={`Orders, page ${params.page}, ${rows.length} of ${total}`}
        emptyState={
          filtered ? (
            <EmptyState
              title={params.q ? `No results for “${params.q}”` : "No orders match these filters"}
              description="Try a different search or clear the filters."
              action={
                <Button variant="outline" asChild>
                  <Link href="/orders">Clear filters</Link>
                </Button>
              }
            />
          ) : (
            <EmptyState
              icon={ClipboardList}
              title="No orders yet"
              description="Create your first order or import a CSV from your ERP."
              action={
                canWrite ? (
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
          )
        }
      />
      <Pagination className="mt-4" page={params.page} pageSize={ORDERS_PAGE_SIZE} total={total} makeHref={(page) => listHref({ page })} />
    </>
  );
}
