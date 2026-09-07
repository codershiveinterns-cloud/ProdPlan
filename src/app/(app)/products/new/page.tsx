import type { Metadata } from "next";

import { PageHeader } from "@/components/layout/PageHeader";
import { safeNext } from "@/lib/auth/guards";
import { requirePagePermission } from "@/lib/products/page-guard";

import { ProductForm } from "../_components/ProductForm";

export const metadata: Metadata = { title: "New product" };

type SearchParams = Record<string, string | string[] | undefined>;

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export default async function NewProductPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requirePagePermission("products:write");
  const sp = await searchParams;
  const rawReturn = first(sp.return);
  const returnTo = rawReturn ? safeNext(rawReturn) : undefined;
  const returnPath = returnTo && returnTo !== "/dashboard" ? returnTo : undefined;

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="New product"
        description="Create the product first; its bill of materials and routing are edited on the product page."
        breadcrumbs={[{ label: "Products", href: "/products" }, { label: "New" }]}
      />
      <ProductForm cancelHref={returnPath ?? "/products"} returnTo={returnPath} />
    </div>
  );
}
