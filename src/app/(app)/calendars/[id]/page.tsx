import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarClock, CalendarOff, Plus } from "lucide-react";

import { AuditList } from "@/components/data/AuditList";
import { EmptyState } from "@/components/data/EmptyState";
import { PageHeader } from "@/components/layout/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  crossesMidnight,
  dailyCapacityMinutes,
  formatDayList,
  shiftNetMinutes,
  weeklyCapacityMinutes,
  weeklySummary,
  workingDaysOf,
} from "@/lib/calendar";
import { calendarAuditWhere, calendarDeleteBlock, getCalendarEditor } from "@/lib/calendars/calendars";
import { toDateOnly, todayInTz } from "@/lib/dates";
import { formatDate, formatDateTime, formatInt } from "@/lib/format";
import { loadAuditEntries } from "@/lib/machines/audit-feed";
import { requirePagePermission } from "@/lib/machines/page-guard";
import { getTenantDb, requireSession } from "@/lib/auth/guards";
import { can } from "@/lib/rbac";
import { cn } from "@/lib/utils";

import { CalendarHeaderActions } from "../_components/CalendarHeaderActions";
import { ExceptionDialog, type ExceptionDialogException } from "../_components/ExceptionDialog";
import { ExceptionRowActions } from "../_components/ExceptionRowActions";
import { ShiftDialog } from "../_components/ShiftDialog";
import { ShiftRowActions } from "../_components/ShiftRowActions";
import { SavedToast } from "@/app/(app)/machines/_components/SavedToast";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const session = await requireSession();
  const calendar = await getTenantDb(session).shiftCalendar.findUnique({ where: { id }, select: { name: true } });
  return { title: calendar ? calendar.name : "Shift calendar" };
}

type ExceptionRow = ExceptionDialogException & { dateLabel: string; dayLabel: string; isPast: boolean };

function ExceptionRows({
  rows,
  calendarId,
  calendarName,
  today,
  canWrite,
}: {
  rows: ExceptionRow[];
  calendarId: string;
  calendarName: string;
  today: string;
  canWrite: boolean;
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead scope="col">Date</TableHead>
          <TableHead scope="col">Working?</TableHead>
          <TableHead scope="col" className="hidden md:table-cell">
            Note
          </TableHead>
          {canWrite ? (
            <TableHead scope="col" className="w-12 text-right">
              <span className="sr-only">Actions</span>
            </TableHead>
          ) : null}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((e) => (
          <TableRow key={e.id}>
            <TableCell>
              {e.dateLabel} <span className="text-muted-foreground">{e.dayLabel}</span>
            </TableCell>
            <TableCell>
              {e.isWorking ? (
                <Badge variant="outline" className="border-green-200 bg-green-50 text-green-700">
                  Working
                </Badge>
              ) : (
                <Badge variant="outline" className="border-gray-300 bg-gray-100 text-gray-700">
                  Non-working
                </Badge>
              )}
            </TableCell>
            <TableCell className="hidden max-w-xs truncate text-muted-foreground md:table-cell" title={e.note ?? undefined}>
              {e.note ?? "—"}
            </TableCell>
            {canWrite ? (
              <TableCell className="text-right">
                <ExceptionRowActions
                  exception={e}
                  dateLabel={e.dateLabel}
                  calendarId={calendarId}
                  calendarName={calendarName}
                  today={today}
                />
              </TableCell>
            ) : null}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export default async function CalendarEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { session, db } = await requirePagePermission("machines:read");
  const calendar = await getCalendarEditor(db, id);
  if (!calendar) notFound();

  const tz = session.tenant.timezone;
  const now = new Date();
  const today = todayInTz(tz, now);
  const canWrite = can(session.user.role, "machines:write");
  const isDefault = session.tenant.defaultCalendarId === calendar.id;
  const [deleteBlock, activity] = await Promise.all([
    calendarDeleteBlock(db, calendar.id, session.tenant.defaultCalendarId),
    loadAuditEntries(db, session, calendarAuditWhere(calendar.id), 20, now),
  ]);

  const shifts = calendar.shifts.map((s) => ({
    id: s.id,
    name: s.name,
    startTime: s.startTime,
    endTime: s.endTime,
    daysOfWeek: s.daysOfWeek,
    breakMinutes: s.breakMinutes,
    net: shiftNetMinutes(s),
    nextDay: crossesMidnight(s),
    daysLabel: formatDayList(s.daysOfWeek),
  }));
  const exceptions: ExceptionRow[] = calendar.exceptions.map((e) => {
    const date = toDateOnly(e.date);
    return {
      id: e.id,
      date,
      isWorking: e.isWorking,
      note: e.note,
      dateLabel: formatDate(date),
      dayLabel: formatDayList([new Date(e.date).getUTCDay()]),
      isPast: date < today,
    };
  });
  const upcomingExceptions = exceptions.filter((e) => !e.isPast);
  const pastExceptions = exceptions.filter((e) => e.isPast).reverse();
  const machineCount = calendar._count.machines;

  const addShift = canWrite ? (
    <ShiftDialog
      calendarId={calendar.id}
      calendarName={calendar.name}
      trigger={
        <Button variant="outline">
          <Plus data-icon="inline-start" />
          Add shift
        </Button>
      }
    />
  ) : null;
  const addException = canWrite ? (
    <ExceptionDialog
      calendarId={calendar.id}
      calendarName={calendar.name}
      today={today}
      trigger={
        <Button variant="outline">
          <Plus data-icon="inline-start" />
          Add exception
        </Button>
      }
    />
  ) : null;

  return (
    <>
      <SavedToast messages={{ created: `Calendar ${calendar.name} created with one default shift` }} />
      <PageHeader
        title={calendar.name}
        breadcrumbs={[{ label: "Shift calendars", href: "/calendars" }, { label: calendar.name }]}
        meta={
          <>
            {isDefault ? <Badge variant="secondary">Default</Badge> : null}
            {!calendar.isActive ? <Badge variant="outline">Inactive</Badge> : null}
          </>
        }
        description={weeklySummary(calendar)}
        actions={
          canWrite ? (
            <CalendarHeaderActions
              calendar={{ id: calendar.id, name: calendar.name, isActive: calendar.isActive }}
              isDefault={isDefault}
              deleteBlock={deleteBlock}
            />
          ) : null
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Calendar</CardTitle>
            <CardDescription>All times are in the plant timezone ({tz}).</CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-[minmax(0,8rem)_1fr] gap-x-3 gap-y-2.5 text-sm">
              <dt className="text-muted-foreground">Status</dt>
              <dd className="flex flex-wrap gap-1.5">
                {calendar.isActive ? (
                  <Badge variant="outline" className="border-green-200 bg-green-50 text-green-700">
                    Active
                  </Badge>
                ) : (
                  <Badge variant="outline">Inactive</Badge>
                )}
                {isDefault ? <Badge variant="secondary">Default for new machines</Badge> : null}
              </dd>
              <dt className="text-muted-foreground">Used by</dt>
              <dd>
                {machineCount > 0 ? (
                  <Link href={`/machines?calendarId=${encodeURIComponent(calendar.id)}`} className="underline-offset-4 hover:underline">
                    {machineCount} {machineCount === 1 ? "machine" : "machines"}
                  </Link>
                ) : (
                  <span className="text-muted-foreground">No machines yet</span>
                )}
              </dd>
              <dt className="text-muted-foreground">Working days</dt>
              <dd>{formatDayList(workingDaysOf(calendar)) || <span className="text-muted-foreground">None</span>}</dd>
              <dt className="text-muted-foreground">Capacity</dt>
              <dd>
                {formatInt(dailyCapacityMinutes(calendar))} min/day · {formatInt(weeklyCapacityMinutes(calendar))} min/week
                <span className="block text-xs text-muted-foreground">Net shift minutes at 100% efficiency.</span>
              </dd>
              <dt className="text-muted-foreground">Created</dt>
              <dd>{formatDateTime(calendar.createdAt, tz)}</dd>
            </dl>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Shifts</CardTitle>
            <CardDescription>{weeklySummary(calendar)}</CardDescription>
            {addShift ? <CardAction>{addShift}</CardAction> : null}
          </CardHeader>
          <CardContent>
            {shifts.length === 0 ? (
              <EmptyState icon={CalendarClock} size="compact" title="No shifts" description="Add a shift so this calendar provides capacity." action={addShift ?? undefined} />
            ) : (
              <div className="overflow-hidden rounded-lg ring-1 ring-foreground/10">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead scope="col">Name</TableHead>
                      <TableHead scope="col">Start</TableHead>
                      <TableHead scope="col">End</TableHead>
                      <TableHead scope="col" className="hidden md:table-cell">
                        Days
                      </TableHead>
                      <TableHead scope="col" className="hidden text-right lg:table-cell">
                        Break
                      </TableHead>
                      <TableHead scope="col" className="text-right">
                        Net min
                      </TableHead>
                      {canWrite ? (
                        <TableHead scope="col" className="w-12 text-right">
                          <span className="sr-only">Actions</span>
                        </TableHead>
                      ) : null}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {shifts.map((s) => (
                      <TableRow key={s.id}>
                        <TableCell className="font-medium">{s.name}</TableCell>
                        <TableCell className="font-mono">{s.startTime}</TableCell>
                        <TableCell className="font-mono">
                          {s.endTime}
                          {s.nextDay ? <span className="ml-1 font-sans text-xs text-muted-foreground">next day</span> : null}
                        </TableCell>
                        <TableCell className="hidden md:table-cell">{s.daysLabel}</TableCell>
                        <TableCell className="hidden text-right tabular-nums lg:table-cell">{s.breakMinutes} min</TableCell>
                        <TableCell className={cn("text-right tabular-nums", s.net <= 0 && "text-destructive")}>{formatInt(s.net)}</TableCell>
                        {canWrite ? (
                          <TableCell className="text-right">
                            <ShiftRowActions shift={s} calendarId={calendar.id} calendarName={calendar.name} isLast={shifts.length <= 1} />
                          </TableCell>
                        ) : null}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>Exceptions</CardTitle>
            <CardDescription>
              Holidays and shutdowns (non-working) remove every shift that day; a working exception runs all shifts on a
              day that is normally off.
            </CardDescription>
            {addException ? <CardAction>{addException}</CardAction> : null}
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {upcomingExceptions.length === 0 ? (
              <EmptyState
                icon={CalendarOff}
                size="compact"
                title="No upcoming exceptions"
                description="Add holidays, plant shutdowns or overtime days."
                action={addException ?? undefined}
              />
            ) : (
              <div className="overflow-hidden rounded-lg ring-1 ring-foreground/10">
                <ExceptionRows rows={upcomingExceptions} calendarId={calendar.id} calendarName={calendar.name} today={today} canWrite={canWrite} />
              </div>
            )}
            {pastExceptions.length > 0 ? (
              <details className="group rounded-lg ring-1 ring-foreground/10">
                <summary className="flex h-11 cursor-pointer list-none items-center justify-between px-3 text-sm font-medium select-none [&::-webkit-details-marker]:hidden">
                  <span>
                    Show past <span className="text-muted-foreground">({pastExceptions.length})</span>
                  </span>
                  <span className="text-xs text-muted-foreground group-open:hidden">Expand</span>
                  <span className="hidden text-xs text-muted-foreground group-open:inline">Collapse</span>
                </summary>
                <div className="border-t">
                  <ExceptionRows rows={pastExceptions} calendarId={calendar.id} calendarName={calendar.name} today={today} canWrite={canWrite} />
                </div>
              </details>
            ) : null}
          </CardContent>
        </Card>

        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>Activity</CardTitle>
            <CardDescription>Changes to this calendar, its shifts and exceptions.</CardDescription>
          </CardHeader>
          <CardContent>
            <AuditList entries={activity} />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
