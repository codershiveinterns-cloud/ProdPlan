import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";

import { ConflictType } from "@/generated/prisma/enums";
import { DataTable, type DataTableColumn } from "@/components/data/DataTable";
import { EmptyState } from "@/components/data/EmptyState";
import { FilterBar } from "@/components/data/FilterBar";
import { Pagination } from "@/components/data/Pagination";
import { CONFLICT_SEVERITY_META, CONFLICT_TYPE_LABELS } from "@/components/schedule/status-meta";
import { FormField } from "@/components/forms/FormField";
import { PageHeader } from "@/components/layout/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { requirePagePermission } from "@/lib/auth/guards";
import { todayInTz } from "@/lib/dates";
import { formatRelative } from "@/lib/format";
import { listConflicts, type ConflictRowDTO } from "@/lib/scheduling/queries";

import { boardHrefForDate } from "../params";
import { conflictsHref, parseConflictParams, type ConflictsSearchParams } from "./params";

export const metadata: Metadata = { title: "Schedule conflicts" };

const NATIVE_SELECT_CLASS = "h-11 rounded-lg border border-input bg-card px-3 text-sm";

function columns(tz: string, now: Date, boardHrefById: Map<string, string>): DataTableColumn<ConflictRowDTO>[] {
  return [
    {
      key: "type",
      header: "Type",
      priority: 1,
      render: (c) => CONFLICT_TYPE_LABELS[c.type],
    },
    {
      key: "severity",
      header: "Severity",
      priority: 1,
      render: (c) => (
        <Badge variant="outline" className={CONFLICT_SEVERITY_META[c.severity].className}>
          {CONFLICT_SEVERITY_META[c.severity].label}
        </Badge>
      ),
    },
    {
      key: "order",
      header: "Order",
      priority: 1,
      render: (c) =>
        c.order ? (
          <Link href={`/orders/${c.order.id}`} className="font-mono underline-offset-4 hover:underline">
            {c.order.orderNumber}
          </Link>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      key: "subject",
      header: "Machine / material",
      priority: 2,
      render: (c) =>
        c.machine ? (
          <span className="font-mono">{c.machine.code}</span>
        ) : c.material ? (
          <span>
            <span className="font-mono">{c.material.code}</span>
            <span className="text-muted-foreground"> · {c.material.name}</span>
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      key: "message",
      header: "Message",
      priority: 1,
      className: "max-w-sm",
      render: (c) => <span className="whitespace-normal">{c.message}</span>,
    },
    {
      key: "created",
      header: "Created",
      priority: 2,
      render: (c) => (
        <span title={c.createdAt}>{formatRelative(c.createdAt, now, tz)}</span>
      ),
    },
    {
      key: "actions",
      header: <span className="sr-only">Actions</span>,
      priority: 1,
      className: "w-48 text-right",
      render: (c) => (
        <div className="flex justify-end gap-2">
          {boardHrefById.has(c.id) ? (
            <Button variant="outline" size="sm" asChild>
              <Link href={boardHrefById.get(c.id)!}>Open on board</Link>
            </Button>
          ) : null}
          {c.order ? (
            <Button variant="outline" size="sm" asChild>
              <Link href={`/orders/${c.order.id}`}>Open order</Link>
            </Button>
          ) : null}
        </div>
      ),
    },
  ];
}

export default async function ScheduleConflictsPage({ searchParams }: { searchParams: Promise<ConflictsSearchParams> }) {
  const { session, db } = await requirePagePermission("schedule:read");
  const tz = session.tenant.timezone;
  const params = parseConflictParams(await searchParams);
  const { rows, total, page, pageSize } = await listConflicts(db, params.filters, params.page);

  // Resolve "Open on board" deep-links: entries → their planned date + work center; machine-only rows → today.
  const entryIds = rows.map((r) => r.entryId).filter((id): id is string => !!id);
  const entries = entryIds.length
    ? await db.scheduleEntry.findMany({ where: { id: { in: entryIds } }, select: { id: true, plannedStartAt: true, workCenterId: true } })
    : [];
  const entryById = new Map(entries.map((e) => [e.id, e]));
  const today = todayInTz(tz);
  const boardHrefById = new Map<string, string>();
  for (const row of rows) {
    if (row.entryId) {
      const entry = entryById.get(row.entryId);
      if (entry) {
        boardHrefById.set(row.id, boardHrefForDate(todayInTz(tz, entry.plannedStartAt), 14, entry.workCenterId));
        continue;
      }
    }
    if (row.machine) {
      boardHrefById.set(row.id, boardHrefForDate(today, 14, undefined));
    }
  }

  const activeFilters = (params.filters.type ? 1 : 0) + (params.filters.severity ? 1 : 0) + (params.showAll ? 1 : 0);

  return (
    <>
      <PageHeader
        title="Schedule conflicts"
        description="Overloaded machines, material shortages and at-risk deadlines flagged by the last schedule run."
        breadcrumbs={[{ label: "Schedule", href: "/schedule" }, { label: "Conflicts" }]}
        actions={
          <Button variant="outline" asChild>
            <Link href="/schedule">Back to board</Link>
          </Button>
        }
      />

      <div className="mb-4">
        <FilterBar activeCount={activeFilters} clearHref="/schedule/conflicts" preserve={[]}>
          <FormField label="Type" htmlFor="type">
            <select name="type" id="type" defaultValue={params.filters.type ?? ""} className={NATIVE_SELECT_CLASS}>
              <option value="">All types</option>
              {Object.values(ConflictType).map((t) => (
                <option key={t} value={t}>
                  {CONFLICT_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Severity" htmlFor="severity">
            <select name="severity" id="severity" defaultValue={params.filters.severity ?? ""} className={NATIVE_SELECT_CLASS}>
              <option value="">All severities</option>
              <option value="CRITICAL">Critical</option>
              <option value="WARNING">Warning</option>
            </select>
          </FormField>
          <label className="flex h-11 items-center gap-2 text-sm">
            <Checkbox name="resolved" value="1" defaultChecked={params.showAll} />
            Show resolved too
          </label>
        </FilterBar>
      </div>

      <DataTable
        columns={columns(tz, new Date(), boardHrefById)}
        rows={rows}
        rowKey={(c) => c.id}
        caption={`Conflicts, page ${page}`}
        emptyState={
          activeFilters > 0 ? (
            <EmptyState title="No results" description="Try different filters." action={<Button variant="outline" asChild><Link href="/schedule/conflicts">Clear filters</Link></Button>} />
          ) : (
            <EmptyState icon={AlertTriangle} title="No open conflicts" description="The last schedule run found no overloaded machines, material shortages or at-risk deadlines." />
          )
        }
      />
      <Pagination className="mt-4" page={page} pageSize={pageSize} total={total} makeHref={(p) => conflictsHref(params, { page: p })} />
    </>
  );
}
