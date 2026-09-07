import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/layout/PageHeader";
import { Badge } from "@/components/ui/badge";
import { requirePagePermission } from "@/lib/products/page-guard";
import { getProduct } from "@/lib/products/queries";

import { ProductForm } from "../../_components/ProductForm";

export const metadata: Metadata = { title: "Edit product" };

export default async function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { db } = await requirePagePermission("products:write");
  const { id } = await params;
  const product = await getProduct(db, id);
  if (!product) notFound();

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title={`Edit ${product.sku}`}
        description={product.name}
        breadcrumbs={[
          { label: "Products", href: "/products" },
          { label: product.sku, href: `/products/${product.id}` },
          { label: "Edit" },
        ]}
        meta={product.isActive ? undefined : <Badge variant="outline">Inactive</Badge>}
      />
      <ProductForm product={product} cancelHref={`/products/${product.id}`} />
    </div>
  );
}
