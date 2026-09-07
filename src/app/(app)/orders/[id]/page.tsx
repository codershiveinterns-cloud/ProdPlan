import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Pencil, RefreshCw } from "lucide-react";

import { AuditList } from "@/components/data/AuditList";
import { DueHint } from "@/components/data/DueHint";
import { PriorityBadge } from "@/components/data/PriorityBadge";
import { StatusBadge } from "@/components/data/StatusBadge";
import { PageHeader } from "@/components/layout/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getTenantDb, requireSession } from "@/lib/auth/guards";
import { todayInTz } from "@/lib/dates";
import { formatDate, formatDateTime, formatQty, formatRelative } from "@/lib/format";
import { requirePagePermission } from "@/lib/orders/guard";
import { historyActor, historyText } from "@/lib/orders/history";
import { getOrderDetail, listOrderAudit } from "@/lib/orders/service";
import { allowedTargets, isTerminal } from "@/lib/orders/status";
import { can } from "@/lib/rbac";

import { FlashToast } from "../_components/FlashToast";
import { MaterialRequirement } from "../_components/MaterialRequirement";
import { RoutingPreview } from "../_components/RoutingPreview";
import { StatusDialog } from "../_components/StatusDialog";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const session = await requireSession();
  const order = await getTenantDb(session).order.findUnique({ where: { id }, select: { orderNumber: true } });
  return { title: order ? order.orderNumber : "Order" };
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{label}</dt>
      <dd className="text-sm text-foreground">{children}</dd>
    </div>
  );
}

export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { session, db } = await requirePagePermission("orders:read");
  const { id } = await params;
  const [order, auditRows] = await Promise.all([getOrderDetail(db, id), listOrderAudit(db, id)]);
  if (!order) notFound();

  const tz = session.tenant.timezone;
  const today = todayInTz(tz);
  const role = session.user.role;
  const targets = allowedTargets(order.status, role);
  const canEdit = can(role, "orders:write");

  return (
    <>
      <FlashToast />
      <PageHeader
        title={<span className="font-mono">{order.orderNumber}</span>}
        breadcrumbs={[{ label: "Orders", href: "/orders" }, { label: order.orderNumber }]}
        meta={
          <>
            <StatusBadge status={order.status} />
            <PriorityBadge priority={order.priority} />
            <span className="text-sm text-muted-foreground">
              Due {formatDate(order.dueDate)} · <DueHint dueDate={order.dueDate} today={today} />
            </span>
          </>
        }
        actions={
          <>
            {targets.length > 0 ? (
              <StatusDialog
                orderId={order.id}
                orderNumber={order.orderNumber}
                currentStatus={order.status}
                targets={targets}
                trigger={
                  <Button variant="outline">
                    <RefreshCw data-icon="inline-start" />
                    Change status
                  </Button>
                }
              />
            ) : null}
            {canEdit ? (
              <Button asChild>
                <Link href={`/orders/${order.id}/edit`}>
                  <Pencil data-icon="inline-start" />
                  {isTerminal(order.status) ? "Edit notes" : "Edit"}
                </Link>
              </Button>
            ) : null}
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Order</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-4 sm:grid-cols-2">
                <Field label="Customer">
                  <Link href={`/customers/${order.customer.id}`} className="font-medium underline-offset-4 hover:underline">
                    {order.customer.name}
                  </Link>
                  {order.customer.code ? <span className="ml-1.5 text-muted-foreground">{order.customer.code}</span> : null}
                  {!order.customer.isActive ? <Badge variant="outline" className="ml-2">Inactive</Badge> : null}
                </Field>
                <Field label="Customer PO ref">{order.customerPoRef ?? "—"}</Field>
                <Field label="Product">
                  <Link href={`/products/${order.product.id}`} className="underline-offset-4 hover:underline">
                    <span className="font-mono text-xs text-muted-foreground">{order.product.sku}</span>{" "}
                    <span className="font-medium">{order.product.name}</span>
                  </Link>
                  {!order.product.isActive ? <Badge variant="outline" className="ml-2">Inactive</Badge> : null}
                </Field>
                <Field label="Quantity">
                  <span className="tabular-nums">{formatQty(order.quantity, order.product.unit)}</span>
                </Field>
                <Field label="Due date">
                  {formatDate(order.dueDate)} <DueHint dueDate={order.dueDate} today={today} className="ml-1" />
                </Field>
                <Field label="Start not before">{order.earliestStartDate ? formatDate(order.earliestStartDate) : "—"}</Field>
                <Field label="Priority">
                  <PriorityBadge priority={order.priority} />
                </Field>
                <Field label="Status">
                  <StatusBadge status={order.status} />
                  {order.completedAt ? <span className="ml-2 text-muted-foreground">completed {formatDateTime(order.completedAt, tz)}</span> : null}
                </Field>
                <Field label="Created">{formatDateTime(order.createdAt, tz)}</Field>
                <Field label="Last updated">{formatDateTime(order.updatedAt, tz)}</Field>
                {order.importBatchId ? (
                  <Field label="Source">
                    <Link href={`/orders?batch=${encodeURIComponent(order.importBatchId)}&status=all`} className="underline-offset-4 hover:underline">
                      CSV import
                    </Link>
                  </Field>
                ) : null}
                <Field label="Notes">
                  {order.notes ? <span className="whitespace-pre-wrap">{order.notes}</span> : "—"}
                </Field>
              </dl>
            </CardContent>
          </Card>

          <Card className="py-0 gap-0">
            <CardHeader className="py-4">
              <CardTitle>Material requirement</CardTitle>
              <CardDescription>
                Required = quantity × material per unit incl. scrap, vs unallocated stock on hand (does not net other open orders —
                allocation arrives with the M2 scheduler).
              </CardDescription>
            </CardHeader>
            <div className="border-t">
              <MaterialRequirement rows={order.materials} productId={order.product.id} />
            </div>
          </Card>

          <Card className="py-0 gap-0">
            <CardHeader className="py-4">
              <CardTitle>Routing preview</CardTitle>
              <CardDescription>Estimated minutes at 100 % efficiency for {formatQty(order.quantity, order.product.unit)}.</CardDescription>
            </CardHeader>
            <div className="border-t">
              <RoutingPreview rows={order.routing} totalMinutes={order.routingTotalMinutes} productId={order.product.id} />
            </div>
          </Card>
        </div>

        <Card className="self-start">
          <CardHeader>
            <CardTitle>History</CardTitle>
          </CardHeader>
          <CardContent>
            <AuditList
              entries={auditRows.map((r) => ({
                id: r.id,
                summary: historyText(r, "order"),
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
    </>
  );
}
