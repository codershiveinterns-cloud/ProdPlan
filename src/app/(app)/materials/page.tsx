import type { Metadata } from "next";
import Link from "next/link";
import { Boxes } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DataTable, type DataTableColumn } from "@/components/data/DataTable";
import { EmptyState } from "@/components/data/EmptyState";
import { FilterBar } from "@/components/data/FilterBar";
import { Pagination } from "@/components/data/Pagination";
import { SearchInput } from "@/components/data/SearchInput";
import { PageHeader } from "@/components/layout/PageHeader";
import { formatQty } from "@/lib/format";
import { reorderState, type ReorderState } from "@/lib/materials/dto";
import {
  countActiveMaterialFilters,
  listMaterials,
  materialListHref,
  parseMaterialListParams,
  type MaterialListRow,
} from "@/lib/materials/list";
import { requirePagePermission } from "@/lib/materials/page-guard";
import { can } from "@/lib/rbac";

import { FlashToast } from "./_components/FlashToast";
import { MaterialRowMenu } from "./_components/MaterialRowMenu";
import { REORDER_ROW_CLASS, ReorderBadge } from "./_components/ReorderBadge";
import { flashMessage } from "./_components/flash";

export const metadata: Metadata = { title: "Materials" };

type SearchParams = Record<string, string | string[] | undefined>;

/** Plain row for the table: quantities pre-formatted in the Server Component (spec §5 "Dates in UI"). */
type Row = {
  id: string;
  code: string;
  name: string;
  unit: string;
  onHand: string;
  threshold: string;
  leadTime: string;
  supplier: string;
  isActive: boolean;
  reorder: ReorderState;
  deletable: boolean;
};

function toRow(m: MaterialListRow): Row {
  return {
    id: m.id,
    code: m.code,
    name: m.name,
    unit: m.unit,
    onHand: formatQty(m.stockOnHand, m.unit),
    threshold: formatQty(m.reorderThreshold, m.unit),
    leadTime: m.reorderLeadTimeDays > 0 ? `${m.reorderLeadTimeDays} d` : "—",
    supplier: m.supplier ?? "—",
    isActive: m.isActive,
    reorder: reorderState(m),
    deletable: m._count.bomItems === 0 && m._count.movements === 0,
  };
}

export default async function MaterialsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const { session, db } = await requirePagePermission("materials:read");
  const sp = await searchParams;
  const params = parseMaterialListParams(sp);
  const { rows, total, page, pageSize } = await listMaterials(db, params);

  const canWrite = can(session.user.role, "materials:write");
  const canMove = can(session.user.role, "stock:move");
  const activeFilters = countActiveMaterialFilters(params);
  const filtered = activeFilters > 0 || params.q !== "";
  const listHref = (patch: Partial<typeof params>) => materialListHref(params, patch);

  const columns: DataTableColumn<Row>[] = [
    {
      key: "code",
      header: "Code",
      priority: 1,
      sortKey: "code",
      render: (m) => (
        <Link
          href={`/materials/${m.id}`}
          className="font-mono font-medium underline-offset-4 hover:underline focus-visible:rounded-sm focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          {m.code}
        </Link>
      ),
    },
    {
      key: "name",
      header: "Name",
      priority: 1,
      sortKey: "name",
      className: "max-w-64 truncate",
      render: (m) => <span title={m.name}>{m.name}</span>,
    },
    { key: "unit", header: "Unit", priority: 3, sortKey: "unit", render: (m) => m.unit },
    {
      key: "onHand",
      header: "On hand",
      priority: 1,
      sortKey: "onHand",
      className: "text-right tabular-nums",
      render: (m) => <span className="font-medium">{m.onHand}</span>,
    },
    {
      key: "threshold",
      header: "Reorder threshold",
      priority: 2,
      sortKey: "threshold",
      className: "text-right tabular-nums",
      render: (m) => m.threshold,
    },
    {
      key: "leadTime",
      header: "Lead time",
      priority: 3,
      sortKey: "leadTime",
      className: "text-right tabular-nums",
      render: (m) => m.leadTime,
    },
    {
      key: "supplier",
      header: "Supplier",
      priority: 3,
      sortKey: "supplier",
      className: "max-w-48 truncate",
      render: (m) => <span title={m.supplier}>{m.supplier}</span>,
    },
    {
      key: "badge",
      header: "Status",
      priority: 1,
      render: (m) => (
        <span className="inline-flex flex-wrap items-center gap-1.5">
          <ReorderBadge state={m.reorder} />
          {!m.isActive ? <Badge variant="outline">Inactive</Badge> : null}
          {m.isActive && !m.reorder ? <span className="text-xs text-muted-foreground">In stock</span> : null}
        </span>
      ),
    },
    {
      key: "actions",
      header: <span className="sr-only">Actions</span>,
      priority: 1,
      className: "w-12 text-right",
      render: (m) => <MaterialRowMenu material={m} canWrite={canWrite} canMove={canMove} deletable={m.deletable} />,
    },
  ];

  return (
    <>
      <FlashToast message={flashMessage(sp.flash)} />
      <PageHeader
        title="Materials"
        description="Raw materials and bought-in parts, with stock on hand and reorder levels."
        actions={
          canWrite ? (
            <Button asChild>
              <Link href="/materials/new">New material</Link>
            </Button>
          ) : undefined
        }
      />

      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <SearchInput placeholder="Search code or name" defaultValue={params.q} />
        <FilterBar activeCount={activeFilters} clearHref="/materials">
          <label className="flex h-11 items-center gap-2 text-sm">
            <Checkbox name="belowThreshold" value="1" defaultChecked={params.belowThreshold} />
            Below reorder only
          </label>
          <label className="flex h-11 items-center gap-2 text-sm">
            <Checkbox name="includeInactive" value="1" defaultChecked={params.includeInactive} />
            Include inactive
          </label>
        </FilterBar>
      </div>

      <DataTable
        columns={columns}
        rows={rows.map(toRow)}
        rowKey={(m) => m.id}
        sort={{ sort: params.sort, dir: params.dir, makeHref: (sort, dir) => listHref({ sort: sort as typeof params.sort, dir, page: 1 }) }}
        rowClassName={(m) => (m.isActive && m.reorder ? REORDER_ROW_CLASS : undefined)}
        caption={`Materials, ${rows.length} of ${total}`}
        emptyState={
          filtered ? (
            <EmptyState
              icon={Boxes}
              title={params.q ? `No results for “${params.q}”` : "No materials match these filters"}
              description={
                params.belowThreshold && !params.q
                  ? "Nothing is at or below its reorder threshold right now."
                  : "Try a different search or clear the filters."
              }
              action={
                <Button variant="outline" asChild>
                  <Link href="/materials">Clear filters</Link>
                </Button>
              }
            />
          ) : (
            <EmptyState
              icon={Boxes}
              title="No materials yet"
              description="Add the raw materials and bought-in parts your products are made from, then build BOMs with them."
              action={
                canWrite ? (
                  <Button asChild>
                    <Link href="/materials/new">New material</Link>
                  </Button>
                ) : undefined
              }
            />
          )
        }
      />
      <Pagination className="mt-4" page={page} pageSize={pageSize} total={total} makeHref={(p) => listHref({ page: p })} />
    </>
  );
}
