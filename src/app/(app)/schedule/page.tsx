import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, CalendarRange } from "lucide-react";

import { EmptyState } from "@/components/data/EmptyState";
import { GanttBoard } from "@/components/schedule/GanttBoard";
import { RunScheduleButton } from "@/components/schedule/RunScheduleButton";
import { ScheduleToolbar } from "@/components/schedule/ScheduleToolbar";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { requirePagePermission } from "@/lib/auth/guards";
import { addDays, todayInTz } from "@/lib/dates";
import { formatDate, formatRelative } from "@/lib/format";
import { can } from "@/lib/rbac";
import { listConflicts, loadBoardWindow } from "@/lib/scheduling/queries";

import { boardHref, parseBoardParams, shiftWindow, type ScheduleSearchParams } from "./params";
import { buildBoardViewModel } from "./view-model";

export const metadata: Metadata = { title: "Planning board" };

export default async function SchedulePage({ searchParams }: { searchParams: Promise<ScheduleSearchParams> }) {
  const { session, db } = await requirePagePermission("schedule:read");
  const tz = session.tenant.timezone;
  const todayIso = todayInTz(tz);
  const params = parseBoardParams(await searchParams, todayIso);

  const [board, workCenters, conflicts] = await Promise.all([
    loadBoardWindow(db, { from: params.from, days: params.days, workCenterId: params.workCenterId, tz }),
    db.workCenter.findMany({ where: { isActive: true }, select: { id: true, code: true, name: true }, orderBy: { code: "asc" } }),
    listConflicts(db, { resolved: false }, 1),
  ]);

  const hasMachines = board.workCenters.some((wc) => wc.machines.length > 0);
  const canRun = can(session.user.role, "schedule:run");
  const canMove = can(session.user.role, "schedule:move");
  const canAddMachines = can(session.user.role, "machines:write");

  const entryIds = board.workCenters.flatMap((wc) => wc.machines.flatMap((m) => m.entries.map((e) => e.id)));
  const orderIds = [...new Set(board.workCenters.flatMap((wc) => wc.machines.flatMap((m) => m.entries.map((e) => e.orderId))))];
  const conflictRows =
    entryIds.length || orderIds.length
      ? await db.scheduleConflict.findMany({
          where: { resolvedAt: null, OR: [...(entryIds.length ? [{ entryId: { in: entryIds } }] : []), ...(orderIds.length ? [{ orderId: { in: orderIds } }] : [])] },
          select: { id: true, entryId: true, orderId: true, type: true, severity: true, message: true },
        })
      : [];

  const boardVM = buildBoardViewModel(board, tz, todayIso, conflictRows);

  const windowEndIso = addDays(params.from, params.days - 1);
  const windowLabel = `${formatDate(params.from)} – ${formatDate(windowEndIso)}`;
  const lastRunLabel = board.lastRunAt ? formatRelative(board.lastRunAt, new Date(), tz) : "never";

  return (
    <>
      <PageHeader
        title="Planning board"
        description="Day-by-day, machine-by-machine view of every planned operation."
        breadcrumbs={[{ label: "Schedule" }]}
      />

      {board.dirty ? (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
          <div className="flex items-center gap-2 text-sm text-amber-900">
            <AlertTriangle className="size-4 shrink-0" aria-hidden="true" />
            <span>Schedule is out of date — orders have changed since the last run.</span>
          </div>
          {canRun ? <RunScheduleButton variant="outline" label="Run schedule" /> : null}
        </div>
      ) : null}

      <ScheduleToolbar
        from={params.from}
        days={params.days}
        workCenterId={params.workCenterId}
        prevHref={boardHref(params, shiftWindow(params, -1))}
        todayHref={boardHref(params, { from: todayIso })}
        nextHref={boardHref(params, shiftWindow(params, 1))}
        windowLabel={windowLabel}
        workCenters={workCenters}
        conflictCount={conflicts.total}
        lastRunLabel={lastRunLabel}
        canRun={canRun}
      />

      {hasMachines ? (
        <GanttBoard board={boardVM} tz={tz} canMove={canMove} />
      ) : (
        <div className="rounded-lg border">
          <EmptyState
            icon={CalendarRange}
            title="Add machines to see the planning board"
            description="The board plots every planned operation across your machines. Add at least one machine with a work center and shift calendar to get started."
            action={
              canAddMachines ? (
                <Button asChild>
                  <Link href="/machines/new">Add a machine</Link>
                </Button>
              ) : undefined
            }
          />
        </div>
      )}
    </>
  );
}
