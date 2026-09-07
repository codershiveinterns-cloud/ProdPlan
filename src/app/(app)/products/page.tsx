import type { Metadata } from "next";
import Link from "next/link";
import { Package } from "lucide-react";

import { DataTable, type DataTableColumn } from "@/components/data/DataTable";
import { EmptyState } from "@/components/data/EmptyState";
import { FilterBar } from "@/components/data/FilterBar";
import { Pagination } from "@/components/data/Pagination";
import { SearchInput } from "@/components/data/SearchInput";
import { PageHeader } from "@/components/layout/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { formatInt, formatQty } from "@/lib/format";
import { listProducts, type ProductListRow } from "@/lib/products/list";
import {
  countActiveProductFilters,
  PRODUCTS_PAGE_SIZE,
  parseProductListParams,
  productListHref,
} from "@/lib/products/list-params";
import { requirePagePermission } from "@/lib/products/page-guard";
import { can } from "@/lib/rbac";

import { FlashToast } from "./_components/FlashToast";
import { ProductRowMenu } from "./_components/ProductRowMenu";

export const metadata: Metadata = { title: "Products" };

type SearchParams = Record<string, string | string[] | undefined>;

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

function columns(canWrite: boolean): DataTableColumn<ProductListRow>[] {
  return [
    {
      key: "sku",
      header: "SKU",
      priority: 1,
      sortKey: "sku",
      render: (p) => (
        <Link
          href={`/products/${p.id}`}
          className="font-mono font-medium underline-offset-4 hover:underline focus-visible:rounded-sm focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          {p.sku}
        </Link>
      ),
    },
    {
      key: "name",
      header: "Name",
      priority: 1,
      sortKey: "name",
      className: "max-w-[28rem]",
      render: (p) => <span className="block truncate">{p.name}</span>,
    },
    { key: "unit", header: "Unit", priority: 3, sortKey: "unit", render: (p) => p.unit },
    {
      key: "bomLines",
      header: "BOM lines",
      priority: 2,
      sortKey: "bomLines",
      className: "text-right tabular-nums",
      render: (p) => (p.bomLines === 0 ? <span className="text-muted-foreground">0</span> : formatInt(p.bomLines)),
    },
    {
      key: "routingSteps",
      header: "Routing steps",
      priority: 3,
      sortKey: "routingSteps",
      className: "text-right tabular-nums",
      render: (p) =>
        p.routingSteps === 0 ? <span className="text-muted-foreground">0</span> : formatInt(p.routingSteps),
    },
    {
      key: "buildable",
      header: "Buildable from stock",
      priority: 2,
      className: "text-right tabular-nums",
      render: (p) =>
        p.buildable === null ? (
          <span className="text-muted-foreground" title="No BOM lines constrain this product">
            —
          </span>
        ) : (
          <span
            className={p.buildable === 0 ? "text-amber-700" : undefined}
            title="vs unallocated stock on hand (does not net other open orders)"
          >
            {formatQty(p.buildable, p.unit)}
          </span>
        ),
    },
    {
      key: "status",
      header: "Status",
      priority: 1,
      render: (p) =>
        p.isActive ? <span className="text-muted-foreground">Active</span> : <Badge variant="outline">Inactive</Badge>,
    },
    {
      key: "actions",
      header: <span className="sr-only">Actions</span>,
      priority: 1,
      className: "w-12 text-right",
      render: (p) => <ProductRowMenu product={{ id: p.id, sku: p.sku, isActive: p.isActive }} canWrite={canWrite} />,
    },
  ];
}

export default async function ProductsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const { session, db } = await requirePagePermission("products:read");
  const sp = await searchParams;
  const params = parseProductListParams(sp);
  const { rows, total } = await listProducts(db, params);
  const canWrite = can(session.user.role, "products:write");
  const activeFilters = countActiveProductFilters(params);
  const filtered = activeFilters > 0 || params.q !== "";

  return (
    <>
      <FlashToast flash={first(sp.flash)} />
      <PageHeader
        title="Products"
        description="Finished goods with their bill of materials and routing."
        actions={
          canWrite ? (
            <Button asChild>
              <Link href="/products/new">New product</Link>
            </Button>
          ) : undefined
        }
      />
      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <SearchInput placeholder="Search SKU or name" defaultValue={params.q} />
        <FilterBar activeCount={activeFilters} clearHref={productListHref(params, { includeInactive: false, page: 1 })}>
          <label className="flex h-11 items-center gap-2 text-sm">
            <Checkbox name="includeInactive" value="1" defaultChecked={params.includeInactive} /> Include inactive
          </label>
        </FilterBar>
      </div>
      <DataTable
        columns={columns(canWrite)}
        rows={rows}
        rowKey={(p) => p.id}
        sort={{ sort: params.sort, dir: params.dir, makeHref: (sort, dir) => productListHref(params, { sort: sort as typeof params.sort, dir, page: 1 }) }}
        rowClassName={(p) => (p.isActive ? undefined : "text-muted-foreground")}
        caption={`Products, ${rows.length} of ${total}`}
        emptyState={
          filtered ? (
            <EmptyState
              icon={Package}
              title={params.q ? `No results for “${params.q}”` : "No results"}
              description={
                params.includeInactive ? "No products match this search." : "Try another search or include inactive products."
              }
              action={
                <Button variant="outline" asChild>
                  <Link href="/products">Clear filters</Link>
                </Button>
              }
            />
          ) : (
            <EmptyState
              icon={Package}
              title="No products yet"
              description="Add the finished goods you make, then build their BOM and routing on the product page."
              action={
                canWrite ? (
                  <Button asChild>
                    <Link href="/products/new">New product</Link>
                  </Button>
                ) : undefined
              }
            />
          )
        }
      />
      <Pagination
        className="mt-4"
        page={params.page}
        pageSize={PRODUCTS_PAGE_SIZE}
        total={total}
        makeHref={(page) => productListHref(params, { page })}
      />
    </>
  );
}
