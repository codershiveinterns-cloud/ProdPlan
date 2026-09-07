import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/layout/PageHeader";
import { getCustomer } from "@/lib/customers";
import { requirePagePermission } from "@/lib/orders/guard";

import { CustomerForm } from "../../_components/CustomerForm";

export const metadata: Metadata = { title: "Edit customer" };

export default async function EditCustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const { db } = await requirePagePermission("customers:write");
  const { id } = await params;
  const customer = await getCustomer(db, id);
  if (!customer) notFound();
  return (
    <>
      <PageHeader
        title={`Edit ${customer.name}`}
        breadcrumbs={[{ label: "Customers", href: "/customers" }, { label: customer.name, href: `/customers/${customer.id}` }, { label: "Edit" }]}
      />
      <div className="max-w-3xl">
        <CustomerForm
          mode="edit"
          customer={{
            id: customer.id,
            name: customer.name,
            code: customer.code,
            email: customer.email,
            phone: customer.phone,
            notes: customer.notes,
            isActive: customer.isActive,
          }}
          cancelHref={`/customers/${customer.id}`}
        />
      </div>
    </>
  );
}
