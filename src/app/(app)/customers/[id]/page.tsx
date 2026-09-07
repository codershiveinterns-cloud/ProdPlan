import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ClipboardList, ClipboardPlus, Pencil } from "lucide-react";

import { AuditList } from "@/components/data/AuditList";
import { EmptyState } from "@/components/data/EmptyState";
import { Pagination } from "@/components/data/Pagination";
import { PageHeader } from "@/components/layout/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getTenantDb, requireSession } from "@/lib/auth/guards";
import { getCustomer } from "@/lib/customers";
import { todayInTz } from "@/lib/dates";
import { formatDateTime, formatRelative } from "@/lib/format";
import { requirePagePermission } from "@/lib/orders/guard";
import { historyActor, historyText } from "@/lib/orders/history";
import { listOrders, orderListQuery, ORDERS_PAGE_SIZE, parseOrderListParams, toOrderSortKey } from "@/lib/orders/list";
import { can } from "@/lib/rbac";
import { FlashToast } from "@/app/(app)/orders/_components/FlashToast";
import { OrdersFilters } from "@/app/(app)/orders/_components/OrdersFilters";
import { OrdersTable } from "@/app/(app)/orders/_components/OrdersTable";

import { CustomerDangerZone } from "../_components/CustomerDangerZone";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const session = await requireSession();
  const customer = await getTenantDb(session).customer.findUnique({ where: { id }, select: { name: true } });
  return { title: customer ? customer.name : "Customer" };
}

type SearchParams = Record<string, string | string[] | undefined>;

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{label}</dt>
      <dd className="text-sm text-foreground">{children}</dd>
    </div>
  );
}

export default async function CustomerDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SearchParams> }) {
  const { session, db } = await requirePagePermission("customers:read");
  const { id } = await params;
  const sp = await searchParams;
  const customer = await getCustomer(db, id);
  if (!customer) notFound();

  // Same list contract as /orders, pinned to this customer; "all" statuses by default so history is visible.
  const listParams = parseOrderListParams({ ...sp, status: sp.status ?? "all", customerId: customer.id });
  const tz = session.tenant.timezone;
  const today = todayInTz(tz);
  const [{ rows, total }, orderCount, auditRows] = await Promise.all([
    listOrders(db, listParams),
    db.order.count({ where: { customerId: customer.id } }),
    db.auditLog.findMany({ where: { entityType: "Customer", entityId: customer.id }, orderBy: { createdAt: "desc" }, take: 20 }),
  ]);
  const base = `/customers/${customer.id}`;
  const listHref = (patch: Partial<typeof listParams>) => `${base}${orderListQuery({ ...listParams, ...patch, customerId: "" })}`;
  const canWrite = can(session.user.role, "customers:write");
  const canCreateOrder = can(session.user.role, "orders:write");

  return (
    <>
      <FlashToast />
      <PageHeader
        title={customer.name}
        breadcrumbs={[{ label: "Customers", href: "/customers" }, { label: customer.name }]}
        meta={!customer.isActive ? <Badge variant="outline">Inactive</Badge> : undefined}
        description={customer.code ? <span className="font-mono">{customer.code}</span> : undefined}
        actions={
          <>
            {canWrite ? (
              <Button variant="outline" asChild>
                <Link href={`${base}/edit`}>
                  <Pencil data-icon="inline-start" />
                  Edit
                </Link>
              </Button>
            ) : null}
            {canCreateOrder && customer.isActive ? (
              <Button asChild>
                <Link href={`/orders/new?customerId=${encodeURIComponent(customer.id)}`}>
                  <ClipboardPlus data-icon="inline-start" />
                  New order for this customer
                </Link>
              </Button>
            ) : null}
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2 self-start">
          <CardHeader>
            <CardTitle>Details</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-4 sm:grid-cols-2">
              <Field label="Email">{customer.email ? <a href={`mailto:${customer.email}`} className="underline-offset-4 hover:underline">{customer.email}</a> : "—"}</Field>
              <Field label="Phone">{customer.phone ? <a href={`tel:${customer.phone}`} className="underline-offset-4 hover:underline">{customer.phone}</a> : "—"}</Field>
              <Field label="Orders">{orderCount.toLocaleString("en-IN")}</Field>
              <Field label="Created">{formatDateTime(customer.createdAt, tz)}</Field>
              <Field label="Notes">{customer.notes ? <span className="whitespace-pre-wrap">{customer.notes}</span> : "—"}</Field>
            </dl>
          </CardContent>
        </Card>
        <Card className="self-start">
          <CardHeader>
            <CardTitle>History</CardTitle>
          </CardHeader>
          <CardContent>
            <AuditList
              entries={auditRows.map((r) => ({
                id: r.id,
                summary: historyText(r, "customer"),
                href: null,
                actorName: historyActor(r),
                createdAtIso: r.createdAt.toISOString(),
                relative: formatRelative(r.createdAt, undefined, tz),
                absolute: formatDateTime(r.createdAt, tz),
              }))}
            />
          </CardContent>
        </Card>
      </div>

      <section className="mt-8" aria-labelledby="customer-orders-heading">
        <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <h2 id="customer-orders-heading" className="text-lg font-semibold tracking-tight">Orders</h2>
            <p className="text-sm text-muted-foreground">{total.toLocaleString("en-IN")} matching</p>
          </div>
          <OrdersFilters params={listParams} customers={[]} clearHref={base} hideCustomer />
        </div>
        <OrdersTable
          rows={rows}
          today={today}
          tz={tz}
          role={session.user.role}
          hideCustomer
          sort={{ sort: listParams.sort, dir: listParams.dir, makeHref: (sort, dir) => listHref({ sort: toOrderSortKey(sort), dir, page: 1 }) }}
          caption={`Orders for ${customer.name}, page ${listParams.page}`}
          emptyState={
            <EmptyState
              icon={ClipboardList}
              size="compact"
              title={orderCount === 0 ? "No orders yet" : "No orders match these filters"}
              description={orderCount === 0 ? "This customer has no orders so far." : undefined}
              action={
                orderCount === 0 && canCreateOrder && customer.isActive ? (
                  <Button asChild>
                    <Link href={`/orders/new?customerId=${encodeURIComponent(customer.id)}`}>New order</Link>
                  </Button>
                ) : orderCount > 0 ? (
                  <Button variant="outline" asChild>
                    <Link href={base}>Clear filters</Link>
                  </Button>
                ) : undefined
              }
            />
          }
        />
        <Pagination className="mt-4" page={listParams.page} pageSize={ORDERS_PAGE_SIZE} total={total} makeHref={(page) => listHref({ page })} />
      </section>

      {canWrite ? (
        <Card className="mt-8">
          <CardHeader>
            <CardTitle>Delete or deactivate</CardTitle>
            <CardDescription>Customers with orders cannot be deleted; deactivate them to hide them from pickers.</CardDescription>
          </CardHeader>
          <CardContent>
            <CustomerDangerZone customer={{ id: customer.id, name: customer.name, isActive: customer.isActive }} orderCount={orderCount} />
          </CardContent>
        </Card>
      ) : null}
    </>
  );
}
