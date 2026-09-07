import type { Metadata } from "next";

import { PageHeader } from "@/components/layout/PageHeader";
import { todayInTz } from "@/lib/dates";
import { listCustomerOptions } from "@/lib/customers";
import { requirePagePermission } from "@/lib/orders/guard";
import { formatOrderNumber } from "@/lib/orders/numbers";

import { OrderForm } from "../_components/OrderForm";

export const metadata: Metadata = { title: "New order" };

type SearchParams = Record<string, string | string[] | undefined>;

function first(v: string | string[] | undefined): string {
  return (Array.isArray(v) ? v[0] : v) ?? "";
}

export default async function NewOrderPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const { session, db } = await requirePagePermission("orders:write");
  const sp = await searchParams;
  const requestedCustomerId = first(sp.customerId).trim();
  const [customers, products, tenant] = await Promise.all([
    listCustomerOptions(db),
    db.product.findMany({ where: { isActive: true }, orderBy: { sku: "asc" }, select: { id: true, sku: true, name: true, unit: true } }),
    db.tenant.findUnique({ where: { id: session.tenant.id }, select: { orderSeq: true } }),
  ]);
  const defaultCustomerId = customers.some((c) => c.id === requestedCustomerId) ? requestedCustomerId : undefined;
  const cancelHref = defaultCustomerId ? `/customers/${defaultCustomerId}` : "/orders";

  return (
    <>
      <PageHeader
        title="New order"
        description="One order is one product line. Multi-line purchase orders are several orders sharing a PO ref."
        breadcrumbs={[{ label: "Orders", href: "/orders" }, { label: "New order" }]}
      />
      <div className="max-w-4xl">
        <OrderForm
          mode="create"
          customers={customers.map((c) => ({ value: c.id, label: c.name, hint: c.code ?? undefined }))}
          products={products.map((p) => ({ value: p.id, label: `${p.sku} · ${p.name}`, hint: p.unit, unit: p.unit }))}
          today={todayInTz(session.tenant.timezone)}
          nextOrderNumber={formatOrderNumber((tenant?.orderSeq ?? 0) + 1)}
          defaultCustomerId={defaultCustomerId}
          cancelHref={cancelHref}
        />
      </div>
    </>
  );
}
