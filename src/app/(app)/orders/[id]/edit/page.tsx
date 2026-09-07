import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/layout/PageHeader";
import { StatusBadge } from "@/components/data/StatusBadge";
import { toDateOnly, todayInTz } from "@/lib/dates";
import { listCustomerOptions } from "@/lib/customers";
import { requirePagePermission } from "@/lib/orders/guard";
import { editableFields } from "@/lib/orders/status";

import { OrderForm, type ProductOption } from "../../_components/OrderForm";
import type { ComboboxOption } from "@/components/forms/Combobox";

export const metadata: Metadata = { title: "Edit order" };

export default async function EditOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { session, db } = await requirePagePermission("orders:write");
  const { id } = await params;
  const order = await db.order.findUnique({
    where: { id },
    include: {
      customer: { select: { id: true, name: true, code: true, isActive: true } },
      product: { select: { id: true, sku: true, name: true, unit: true, isActive: true } },
    },
  });
  if (!order) notFound();

  const [customers, products] = await Promise.all([
    listCustomerOptions(db),
    db.product.findMany({ where: { isActive: true }, orderBy: { sku: "asc" }, select: { id: true, sku: true, name: true, unit: true } }),
  ]);
  // The current customer/product stay selectable even when they have since been deactivated.
  const customerOptions: ComboboxOption[] = customers.map((c) => ({ value: c.id, label: c.name, hint: c.code ?? undefined }));
  if (!customers.some((c) => c.id === order.customerId)) {
    customerOptions.unshift({ value: order.customer.id, label: order.customer.name, hint: order.customer.isActive ? (order.customer.code ?? undefined) : "inactive" });
  }
  const productOptions: ProductOption[] = products.map((p) => ({ value: p.id, label: `${p.sku} · ${p.name}`, hint: p.unit, unit: p.unit }));
  if (!products.some((p) => p.id === order.productId)) {
    productOptions.unshift({ value: order.product.id, label: `${order.product.sku} · ${order.product.name}`, hint: order.product.isActive ? order.product.unit : "inactive", unit: order.product.unit });
  }

  return (
    <>
      <PageHeader
        title={`Edit ${order.orderNumber}`}
        meta={<StatusBadge status={order.status} />}
        breadcrumbs={[{ label: "Orders", href: "/orders" }, { label: order.orderNumber, href: `/orders/${order.id}` }, { label: "Edit" }]}
      />
      <div className="max-w-4xl">
        <OrderForm
          mode="edit"
          customers={customerOptions}
          products={productOptions}
          today={todayInTz(session.tenant.timezone)}
          editable={[...editableFields(order.status)]}
          order={{
            id: order.id,
            orderNumber: order.orderNumber,
            status: order.status,
            customerId: order.customerId,
            customerName: order.customer.name,
            productId: order.productId,
            productLabel: `${order.product.sku} · ${order.product.name}`,
            productUnit: order.product.unit,
            quantity: Number(String(order.quantity)),
            priority: order.priority,
            dueDate: toDateOnly(order.dueDate),
            earliestStartDate: order.earliestStartDate ? toDateOnly(order.earliestStartDate) : null,
            customerPoRef: order.customerPoRef,
            notes: order.notes,
          }}
          cancelHref={`/orders/${order.id}`}
        />
      </div>
    </>
  );
}
