import type { Metadata } from "next";
import Link from "next/link";
import { Cog, Plus } from "lucide-react";

import { DataTable, type DataTableColumn } from "@/components/data/DataTable";
import { EmptyState } from "@/components/data/EmptyState";
import { FilterBar } from "@/components/data/FilterBar";
import { MACHINE_STATUSES, MachineStatusBadge, machineStatusLabel } from "@/components/data/MachineStatusBadge";
import { Pagination } from "@/components/data/Pagination";
import { SearchInput } from "@/components/data/SearchInput";
import { FormField } from "@/components/forms/FormField";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { formatInt } from "@/lib/format";
import { NATIVE_SELECT_CLASS } from "@/lib/machines/form-fields";
import { PAGE_SIZE, type SearchParams } from "@/lib/machines/list-params";
import {
  countMachineFilters,
  listMachines,
  machineListHref,
  parseMachineListParams,
  type MachineRow,
} from "@/lib/machines/machines";
import { requirePagePermission } from "@/lib/machines/page-guard";
import { workCenterOptions } from "@/lib/machines/work-centers";
import { can } from "@/lib/rbac";

import { MachineRowMenu } from "./_components/MachineRowMenu";
import { SavedToast } from "./_components/SavedToast";

export const metadata: Metadata = { title: "Machines" };

function columns(canWrite: boolean): DataTableColumn<MachineRow>[] {
  return [
    {
      key: "code",
      header: "Code",
      priority: 1,
      sortKey: "code",
      render: (m) => (
        <Link href={`/machines/${m.id}`} className="font-mono font-medium underline-offset-4 hover:underline">
          {m.code}
        </Link>
      ),
    },
    { key: "name", header: "Name", priority: 1, sortKey: "name", render: (m) => m.name },
    {
      key: "workCenter",
      header: "Work center",
      priority: 2,
      sortKey: "workCenter",
      render: (m) => (
        <span>
          <span className="font-mono">{m.workCenterCode}</span>
          <span className="text-muted-foreground"> · {m.workCenterName}</span>
        </span>
      ),
    },
    {
      key: "status",
      header: "Status",
      priority: 1,
      sortKey: "status",
      className: "whitespace-normal",
      render: (m) => <MachineStatusBadge status={m.status} activeDowntime={m.activeDowntime} />,
    },
    {
      key: "calendar",
      header: "Calendar",
      priority: 3,
      sortKey: "calendar",
      render: (m) => (
        <Link href={`/calendars/${m.calendarId}`} className="underline-offset-4 hover:underline">
          {m.calendarName}
        </Link>
      ),
    },
    {
      key: "shifts",
      header: "Shifts/day",
      priority: 3,
      className: "w-24 text-right tabular-nums",
      render: (m) => m.shiftsPerDay,
    },
    {
      key: "capacity",
      header: "Capacity/day (min)",
      priority: 2,
      className: "w-36 text-right tabular-nums",
      render: (m) => (
        <span title={`${m.efficiencyPercent}% efficiency`}>{formatInt(m.capacityPerDay)}</span>
      ),
    },
    {
      key: "rated",
      header: "Rated output",
      priority: 3,
      className: "text-muted-foreground",
      render: (m) => (m.ratedOutput ? `${m.ratedOutput} / shift` : "—"),
    },
    {
      key: "actions",
      header: <span className="sr-only">Actions</span>,
      priority: 1,
      className: "w-12 text-right",
      render: (m) => <MachineRowMenu machine={m} canWrite={canWrite} />,
    },
  ];
}

export default async function MachinesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const { session, db } = await requirePagePermission("machines:read");
  const params = parseMachineListParams(await searchParams);
  const canWrite = can(session.user.role, "machines:write");
  const tz = session.tenant.timezone;
  const [{ rows, total }, workCenters] = await Promise.all([
    listMachines(db, params, tz),
    workCenterOptions(db, params.workCenterId || null),
  ]);
  const activeFilters = countMachineFilters(params);
  const filtered = activeFilters > 0 || params.q !== "";

  return (
    <>
      <SavedToast messages={{ deleted: "Machine deleted" }} />
      <PageHeader
        title="Machines"
        description="Every machine's availability, shift calendar and time-based capacity."
        actions={
          <>
            <Button variant="outline" asChild>
              <Link href="/work-centers">Work centers</Link>
            </Button>
            {canWrite ? (
              <Button asChild>
                <Link href="/machines/new">
                  <Plus data-icon="inline-start" />
                  New machine
                </Link>
              </Button>
            ) : null}
          </>
        }
      />
      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <SearchInput placeholder="Search code or name" defaultValue={params.q} />
        <FilterBar activeCount={activeFilters} clearHref="/machines">
          {params.calendarId ? <input type="hidden" name="calendarId" value={params.calendarId} /> : null}
          <FormField label="Work center" htmlFor="workCenterId">
            <select name="workCenterId" defaultValue={params.workCenterId} className={NATIVE_SELECT_CLASS}>
              <option value="">All work centers</option>
              {workCenters.map((wc) => (
                <option key={wc.id} value={wc.id}>
                  {wc.code} · {wc.name}
                  {!wc.isActive ? " (inactive)" : ""}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Status" htmlFor="status">
            <select name="status" defaultValue={params.status} className={NATIVE_SELECT_CLASS}>
              <option value="">Active + maintenance</option>
              {MACHINE_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {machineStatusLabel(s)}
                </option>
              ))}
            </select>
          </FormField>
          <label className="flex h-11 items-center gap-2 text-sm">
            <Checkbox name="includeInactive" value="1" defaultChecked={params.includeInactive} />
            Include inactive
          </label>
        </FilterBar>
      </div>
      <DataTable
        columns={columns(canWrite)}
        rows={rows}
        rowKey={(m) => m.id}
        sort={{ sort: params.sort, dir: params.dir, makeHref: (sort, dir) => machineListHref(params, { sort, dir, page: 1 }) }}
        caption={`Machines, page ${params.page}`}
        emptyState={
          filtered ? (
            <EmptyState
              title={params.q ? `No results for “${params.q}”` : "No results"}
              description="Try a different search or clear the filters."
              action={
                <Button variant="outline" asChild>
                  <Link href="/machines">Clear filters</Link>
                </Button>
              }
            />
          ) : (
            <EmptyState
              icon={Cog}
              title="No machines yet"
              description="Add your machines with their work center, shift calendar and efficiency to see daily capacity."
              action={
                canWrite ? (
                  <>
                    <Button asChild>
                      <Link href="/machines/new">New machine</Link>
                    </Button>
                    <Button variant="outline" asChild>
                      <Link href="/work-centers">Set up work centers</Link>
                    </Button>
                  </>
                ) : undefined
              }
            />
          )
        }
      />
      <Pagination
        className="mt-4"
        page={params.page}
        pageSize={PAGE_SIZE}
        total={total}
        makeHref={(page) => machineListHref(params, { page })}
      />
    </>
  );
}
