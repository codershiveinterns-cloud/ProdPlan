import type { Metadata } from "next";

import { PageHeader } from "@/components/layout/PageHeader";
import { requirePagePermission } from "@/lib/orders/guard";

import { CustomerForm } from "../_components/CustomerForm";

export const metadata: Metadata = { title: "New customer" };

export default async function NewCustomerPage() {
  await requirePagePermission("customers:write");
  return (
    <>
      <PageHeader title="New customer" breadcrumbs={[{ label: "Customers", href: "/customers" }, { label: "New customer" }]} />
      <div className="max-w-3xl">
        <CustomerForm mode="create" cancelHref="/customers" />
      </div>
    </>
  );
}
