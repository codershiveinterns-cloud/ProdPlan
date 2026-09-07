import type { Metadata } from "next";
import Link from "next/link";
import { CalendarClock, Plus } from "lucide-react";

import { DataTable, type DataTableColumn } from "@/components/data/DataTable";
import { EmptyState } from "@/components/data/EmptyState";
import { FilterBar } from "@/components/data/FilterBar";
import { Pagination } from "@/components/data/Pagination";
import { SearchInput } from "@/components/data/SearchInput";
import { PageHeader } from "@/components/layout/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  calendarListHref,
  countCalendarFilters,
  listCalendars,
  parseCalendarListParams,
  type CalendarRow,
} from "@/lib/calendars/calendars";
import { formatInt } from "@/lib/format";
import { PAGE_SIZE, type SearchParams } from "@/lib/machines/list-params";
import { requirePagePermission } from "@/lib/machines/page-guard";
import { can } from "@/lib/rbac";

import { CalendarRowMenu } from "./_components/CalendarRowMenu";
import { SavedToast } from "@/app/(app)/machines/_components/SavedToast";

export const metadata: Metadata = { title: "Shift calendars" };

function columns(canWrite: boolean): DataTableColumn<CalendarRow>[] {
  return [
    {
      key: "name",
      header: "Name",
      priority: 1,
      sortKey: "name",
      className: "whitespace-normal",
      render: (c) => (
        <span className="inline-flex flex-wrap items-center gap-2">
          <Link href={`/calendars/${c.id}`} className="font-medium underline-offset-4 hover:underline">
            {c.name}
          </Link>
          {c.isDefault ? <Badge variant="secondary">Default</Badge> : null}
          {!c.isActive ? <Badge variant="outline">Inactive</Badge> : null}
        </span>
      ),
    },
    {
      key: "shifts",
      header: "Shifts",
      priority: 2,
      className: "w-20 text-right tabular-nums",
      render: (c) => c.shiftCount,
    },
    {
      key: "minutes",
      header: "Min/day",
      priority: 2,
      className: "w-24 text-right tabular-nums",
      render: (c) => formatInt(c.minutesPerDay),
    },
    {
      key: "machines",
      header: "Machines",
      priority: 2,
      sortKey: "machines",
      className: "w-24 text-right tabular-nums",
      render: (c) =>
        c.machineCount > 0 ? (
          <Link href={`/machines?calendarId=${encodeURIComponent(c.id)}`} className="underline-offset-4 hover:underline">
            {c.machineCount}
          </Link>
        ) : (
          <span className="text-muted-foreground">0</span>
        ),
    },
    {
      key: "summary",
      header: "Weekly pattern",
      priority: 3,
      className: "text-muted-foreground",
      render: (c) => c.summary,
    },
    {
      key: "actions",
      header: <span className="sr-only">Actions</span>,
      priority: 1,
      className: "w-12 text-right",
      render: (c) => <CalendarRowMenu calendar={c} canWrite={canWrite} />,
    },
  ];
}

export default async function CalendarsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const { session, db } = await requirePagePermission("machines:read");
  const params = parseCalendarListParams(await searchParams);
  const canWrite = can(session.user.role, "machines:write");
  const { rows, total } = await listCalendars(db, params, session.tenant.defaultCalendarId);
  const activeFilters = countCalendarFilters(params);
  const filtered = activeFilters > 0 || params.q !== "";

  return (
    <>
      <SavedToast messages={{ deleted: "Calendar deleted" }} />
      <PageHeader
        title="Shift calendars"
        description="Weekly shift patterns and exceptions. Each machine runs on one calendar; new machines get the default."
        actions={
          canWrite ? (
            <Button asChild>
              <Link href="/calendars/new">
                <Plus data-icon="inline-start" />
                New calendar
              </Link>
            </Button>
          ) : null
        }
      />
      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <SearchInput placeholder="Search calendars" defaultValue={params.q} />
        <FilterBar activeCount={activeFilters} clearHref="/calendars">
          <label className="flex h-11 items-center gap-2 text-sm">
            <Checkbox name="includeInactive" value="1" defaultChecked={params.includeInactive} />
            Include inactive
          </label>
        </FilterBar>
      </div>
      <DataTable
        columns={columns(canWrite)}
        rows={rows}
        rowKey={(c) => c.id}
        sort={{ sort: params.sort, dir: params.dir, makeHref: (sort, dir) => calendarListHref(params, { sort, dir, page: 1 }) }}
        caption={`Shift calendars, page ${params.page}`}
        emptyState={
          filtered ? (
            <EmptyState
              title={params.q ? `No results for “${params.q}”` : "No results"}
              description="Try a different search or clear the filters."
              action={
                <Button variant="outline" asChild>
                  <Link href="/calendars">Clear filters</Link>
                </Button>
              }
            />
          ) : (
            <EmptyState
              icon={CalendarClock}
              title="No shift calendars yet"
              description="Create a calendar with your shift pattern so machines know when they can run."
              action={
                canWrite ? (
                  <Button asChild>
                    <Link href="/calendars/new">New calendar</Link>
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
        pageSize={PAGE_SIZE}
        total={total}
        makeHref={(page) => calendarListHref(params, { page })}
      />
    </>
  );
}
