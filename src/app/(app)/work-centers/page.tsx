import type { Metadata } from "next";
import Link from "next/link";
import { Factory, Plus } from "lucide-react";

import { DataTable, type DataTableColumn } from "@/components/data/DataTable";
import { EmptyState } from "@/components/data/EmptyState";
import { FilterBar } from "@/components/data/FilterBar";
import { Pagination } from "@/components/data/Pagination";
import { SearchInput } from "@/components/data/SearchInput";
import { PageHeader } from "@/components/layout/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { safeNext } from "@/lib/auth/guards";
import { PAGE_SIZE, type SearchParams } from "@/lib/machines/list-params";
import { requirePagePermission } from "@/lib/machines/page-guard";
import {
  countWorkCenterFilters,
  listWorkCenters,
  parseWorkCenterListParams,
  workCenterListHref,
  type WorkCenterRow,
} from "@/lib/machines/work-centers";
import { can } from "@/lib/rbac";

import { WorkCenterDialog } from "./_components/WorkCenterDialog";
import { WorkCenterRowMenu } from "./_components/WorkCenterRowMenu";

export const metadata: Metadata = { title: "Work centers" };

function columns(canWrite: boolean): DataTableColumn<WorkCenterRow>[] {
  return [
    {
      key: "code",
      header: "Code",
      priority: 1,
      sortKey: "code",
      render: (wc) => (
        <Link
          href={`/machines?workCenterId=${encodeURIComponent(wc.id)}`}
          className="font-mono font-medium underline-offset-4 hover:underline"
        >
          {wc.code}
        </Link>
      ),
    },
    {
      key: "name",
      header: "Name",
      priority: 1,
      sortKey: "name",
      render: (wc) => (
        <span className="inline-flex flex-wrap items-center gap-2">
          <span>{wc.name}</span>
          {!wc.isActive ? <Badge variant="outline">Inactive</Badge> : null}
        </span>
      ),
    },
    {
      key: "description",
      header: "Description",
      priority: 3,
      className: "max-w-md whitespace-normal text-muted-foreground",
      render: (wc) => wc.description ?? "",
    },
    {
      key: "machines",
      header: "Machines",
      priority: 2,
      sortKey: "machines",
      className: "w-28 text-right tabular-nums",
      render: (wc) => wc.machineCount,
    },
    {
      key: "operations",
      header: "Routing steps",
      priority: 3,
      className: "w-32 text-right tabular-nums",
      render: (wc) => wc.operationCount,
    },
    {
      key: "actions",
      header: <span className="sr-only">Actions</span>,
      priority: 1,
      className: "w-12 text-right",
      render: (wc) => <WorkCenterRowMenu workCenter={wc} canWrite={canWrite} />,
    },
  ];
}

export default async function WorkCentersPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const { session, db } = await requirePagePermission("machines:read");
  const sp = await searchParams;
  const params = parseWorkCenterListParams(sp);
  const canWrite = can(session.user.role, "machines:write");
  const returnParam = Array.isArray(sp.return) ? sp.return[0] : sp.return;
  const returnTo = returnParam ? safeNext(returnParam) : undefined;
  const { rows, total } = await listWorkCenters(db, params);
  const activeFilters = countWorkCenterFilters(params);
  const filtered = activeFilters > 0 || params.q !== "";

  const newButton = canWrite ? (
    <WorkCenterDialog
      returnTo={returnTo}
      trigger={
        <Button>
          <Plus data-icon="inline-start" />
          New work center
        </Button>
      }
    />
  ) : null;

  return (
    <>
      <PageHeader
        title="Work centers"
        description="Groups of machines that do the same kind of work. Routings and machines reference them."
        actions={
          <>
            <Button variant="outline" asChild>
              <Link href="/machines">Machines</Link>
            </Button>
            {newButton}
          </>
        }
      />
      {returnTo ? (
        <p className="mb-4 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-sm">
          Create a work center, then you will be taken back to{" "}
          <Link href={returnTo} className="font-medium underline underline-offset-4">
            where you came from
          </Link>
          .
        </p>
      ) : null}
      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <SearchInput placeholder="Search code or name" defaultValue={params.q} />
        <FilterBar activeCount={activeFilters} clearHref="/work-centers">
          <label className="flex h-11 items-center gap-2 text-sm">
            <Checkbox name="includeInactive" value="1" defaultChecked={params.includeInactive} />
            Include inactive
          </label>
        </FilterBar>
      </div>
      <DataTable
        columns={columns(canWrite)}
        rows={rows}
        rowKey={(wc) => wc.id}
        sort={{ sort: params.sort, dir: params.dir, makeHref: (sort, dir) => workCenterListHref(params, { sort, dir, page: 1 }) }}
        caption={`Work centers, page ${params.page}`}
        emptyState={
          filtered ? (
            <EmptyState
              title={params.q ? `No results for “${params.q}”` : "No results"}
              description="Try a different search or clear the filters."
              action={
                <Button variant="outline" asChild>
                  <Link href="/work-centers">Clear filters</Link>
                </Button>
              }
            />
          ) : (
            <EmptyState
              icon={Factory}
              title="No work centers yet"
              description="Add the areas of your plant (CNC, Assembly, Paint…) so machines and routings can reference them."
              action={newButton}
            />
          )
        }
      />
      <Pagination
        className="mt-4"
        page={params.page}
        pageSize={PAGE_SIZE}
        total={total}
        makeHref={(page) => workCenterListHref(params, { page })}
      />
    </>
  );
}
