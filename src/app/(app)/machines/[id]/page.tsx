import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarClock, Pencil, Plus } from "lucide-react";

import { AuditList } from "@/components/data/AuditList";
import { DowntimeTypeBadge } from "@/components/data/DowntimeTypeBadge";
import { EmptyState } from "@/components/data/EmptyState";
import { MachineStatusBadge } from "@/components/data/MachineStatusBadge";
import { PageHeader } from "@/components/layout/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { weeklySummary } from "@/lib/calendar";
import { todayInTz } from "@/lib/dates";
import { formatDateTime, formatTime } from "@/lib/format";
import { loadAuditEntries } from "@/lib/machines/audit-feed";
import { buildCapacityTable } from "@/lib/machines/capacity";
import { listDowntime, machineAuditWhere, type DowntimeRow } from "@/lib/machines/downtime";
import { getMachineDetail, machineUsage, ratedOutputLabel } from "@/lib/machines/machines";
import { requirePagePermission } from "@/lib/machines/page-guard";
import { can } from "@/lib/rbac";

import { CapacityTable } from "../_components/CapacityTable";
import { DowntimeDialog } from "../_components/DowntimeDialog";
import { DowntimeRowActions } from "../_components/DowntimeRowActions";
import { MachineActionsMenu } from "../_components/MachineActionsMenu";
import { SavedToast } from "../_components/SavedToast";

export const metadata: Metadata = { title: "Machine" };

function DowntimeRows({
  rows,
  machineCode,
  tz,
  canWrite,
}: {
  rows: DowntimeRow[];
  machineCode: string;
  tz: string;
  canWrite: boolean;
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead scope="col">When</TableHead>
          <TableHead scope="col">Type</TableHead>
          <TableHead scope="col" className="hidden md:table-cell">
            Reason
          </TableHead>
          {canWrite ? (
            <TableHead scope="col" className="w-12 text-right">
              <span className="sr-only">Actions</span>
            </TableHead>
          ) : null}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((w) => (
          <TableRow key={w.id} className={w.isActive ? "bg-red-50/60" : undefined}>
            <TableCell className="whitespace-normal">
              <span title={`${w.startsAtLabel} → ${w.endsAtLabel}`}>{w.rangeLabel}</span>
            </TableCell>
            <TableCell className="whitespace-normal">
              <span className="inline-flex flex-wrap items-center gap-1.5">
                <DowntimeTypeBadge type={w.type} />
                {w.isActive ? (
                  <Badge variant="outline" className="border-red-200 bg-red-50 text-red-700">
                    Active now
                  </Badge>
                ) : null}
              </span>
            </TableCell>
            <TableCell className="hidden max-w-xs truncate text-muted-foreground md:table-cell" title={w.reason ?? undefined}>
              {w.reason ?? "—"}
            </TableCell>
            {canWrite ? (
              <TableCell className="text-right">
                <DowntimeRowActions window={w} machineCode={machineCode} tz={tz} />
              </TableCell>
            ) : null}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export default async function MachineDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { session, db } = await requirePagePermission("machines:read");
  const machine = await getMachineDetail(db, id);
  if (!machine) notFound();

  const tz = session.tenant.timezone;
  const now = new Date();
  const today = todayInTz(tz, now);
  const canWrite = can(session.user.role, "machines:write");
  const canDowntime = can(session.user.role, "downtime:write");

  const [downtime, usage, activity] = await Promise.all([
    listDowntime(db, machine.id, tz, now),
    machineUsage(db, machine.id),
    loadAuditEntries(db, session, machineAuditWhere(machine.id), 20, now),
  ]);
  const active = downtime.upcoming.find((w) => w.isActive) ?? null;
  const capacity = buildCapacityTable(machine, machine.calendar, downtime.all, today, tz);
  const rated = ratedOutputLabel(machine);

  return (
    <>
      <SavedToast messages={{ created: `Machine ${machine.code} created`, updated: `Machine ${machine.code} saved` }} />
      <PageHeader
        title={<span className="font-mono">{machine.code}</span>}
        description={machine.name}
        breadcrumbs={[{ label: "Machines", href: "/machines" }, { label: machine.code }]}
        meta={
          <MachineStatusBadge
            status={machine.status}
            activeDowntime={active ? { type: active.type, until: formatTime(active.endsAt, tz) } : null}
          />
        }
        actions={
          <>
            {canDowntime ? (
              <DowntimeDialog
                machineId={machine.id}
                machineCode={machine.code}
                tz={tz}
                trigger={
                  <Button variant={canWrite ? "outline" : "default"}>
                    <Plus data-icon="inline-start" />
                    Add downtime
                  </Button>
                }
              />
            ) : null}
            {canWrite ? (
              <>
                <Button asChild>
                  <Link href={`/machines/${machine.id}/edit`}>
                    <Pencil data-icon="inline-start" />
                    Edit
                  </Link>
                </Button>
                <MachineActionsMenu
                  machine={{ id: machine.id, code: machine.code, status: machine.status }}
                  usageOperations={usage.operations}
                />
              </>
            ) : null}
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-[minmax(0,9rem)_1fr] gap-x-3 gap-y-2.5 text-sm">
              <dt className="text-muted-foreground">Work center</dt>
              <dd>
                <Link
                  href={`/machines?workCenterId=${encodeURIComponent(machine.workCenter.id)}`}
                  className="underline-offset-4 hover:underline"
                >
                  <span className="font-mono">{machine.workCenter.code}</span> · {machine.workCenter.name}
                </Link>
                {!machine.workCenter.isActive ? (
                  <Badge variant="outline" className="ml-2">
                    Inactive
                  </Badge>
                ) : null}
              </dd>
              <dt className="text-muted-foreground">Shift calendar</dt>
              <dd>
                <Link href={`/calendars/${machine.calendar.id}`} className="underline-offset-4 hover:underline">
                  {machine.calendar.name}
                </Link>
                {machine.calendar.id === session.tenant.defaultCalendarId ? (
                  <Badge variant="secondary" className="ml-2">
                    Default
                  </Badge>
                ) : null}
                <span className="block text-xs text-muted-foreground">{weeklySummary(machine.calendar)}</span>
              </dd>
              <dt className="text-muted-foreground">Efficiency</dt>
              <dd>{machine.efficiencyPercent}%</dd>
              <dt className="text-muted-foreground">Rated output</dt>
              <dd>{rated ? `${rated} per shift` : <span className="text-muted-foreground">—</span>}</dd>
              <dt className="text-muted-foreground">Routing steps</dt>
              <dd>
                {usage.operations > 0 ? (
                  `Fixed machine on ${usage.operations} routing ${usage.operations === 1 ? "step" : "steps"}`
                ) : (
                  <span className="text-muted-foreground">Not pinned by any routing step</span>
                )}
              </dd>
              <dt className="text-muted-foreground">Created</dt>
              <dd>{formatDateTime(machine.createdAt, tz)}</dd>
              {machine.notes ? (
                <>
                  <dt className="text-muted-foreground">Notes</dt>
                  <dd className="whitespace-pre-wrap">{machine.notes}</dd>
                </>
              ) : null}
            </dl>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Capacity — next 7 days</CardTitle>
            <CardDescription>
              Shift minutes from <Link href={`/calendars/${machine.calendar.id}`} className="underline underline-offset-4">{machine.calendar.name}</Link>, at{" "}
              {machine.efficiencyPercent}% efficiency, minus downtime overlap.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <CapacityTable table={capacity} />
          </CardContent>
        </Card>

        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>Downtime windows</CardTitle>
            <CardDescription>
              Upcoming and active windows first. A window blocks capacity for its duration and never changes the machine
              status.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {downtime.upcoming.length === 0 ? (
              <EmptyState
                icon={CalendarClock}
                size="compact"
                title="No upcoming downtime"
                description="Plan maintenance or record a breakdown to take this machine out of the schedule for a while."
                action={
                  canDowntime ? (
                    <DowntimeDialog
                      machineId={machine.id}
                      machineCode={machine.code}
                      tz={tz}
                      trigger={<Button variant="outline">Add downtime</Button>}
                    />
                  ) : undefined
                }
              />
            ) : (
              <div className="overflow-hidden rounded-lg ring-1 ring-foreground/10">
                <DowntimeRows rows={downtime.upcoming} machineCode={machine.code} tz={tz} canWrite={canDowntime} />
              </div>
            )}
            {downtime.past.length > 0 ? (
              <details className="group rounded-lg ring-1 ring-foreground/10">
                <summary className="flex h-11 cursor-pointer list-none items-center justify-between px-3 text-sm font-medium select-none [&::-webkit-details-marker]:hidden">
                  <span>
                    Show past <span className="text-muted-foreground">({downtime.past.length})</span>
                  </span>
                  <span className="text-xs text-muted-foreground group-open:hidden">Expand</span>
                  <span className="hidden text-xs text-muted-foreground group-open:inline">Collapse</span>
                </summary>
                <div className="border-t">
                  <DowntimeRows rows={downtime.past} machineCode={machine.code} tz={tz} canWrite={canDowntime} />
                </div>
              </details>
            ) : null}
          </CardContent>
        </Card>

        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>Activity</CardTitle>
            <CardDescription>Changes to this machine and its downtime windows.</CardDescription>
          </CardHeader>
          <CardContent>
            <AuditList entries={activity} />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
