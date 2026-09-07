import { Activity, AlertTriangle, Boxes, CalendarClock, ClipboardList, Cog } from "lucide-react";

import { StatCard } from "@/components/data/StatCard";
import type { DashboardData } from "@/lib/dashboard/queries";
import { formatInt } from "@/lib/format";

/** "5 active · 1 in maintenance · 2 down now" — the pieces are separate so "down now" can be emphasised. */
export function machinesHint(m: DashboardData["kpis"]["machines"]): { active: string; maintenance: string; downNow: string | null } {
  return {
    active: `${formatInt(m.active)} active`,
    maintenance: `${formatInt(m.maintenance)} in maintenance`,
    downNow: m.downNow > 0 ? `${formatInt(m.downNow)} down now` : null,
  };
}

/** Orders + Resources KPI tiles (spec §6.6). Every tile links to the identically filtered list. */
export function KpiTiles({ kpis, hrefs }: { kpis: DashboardData["kpis"]; hrefs: DashboardData["hrefs"] }) {
  const m = machinesHint(kpis.machines);
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="mb-3 text-sm font-semibold tracking-wide text-muted-foreground uppercase">Orders</h2>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Open" value={formatInt(kpis.orders.open)} href={hrefs.open} icon={ClipboardList} hint="Queued, in progress or on hold" />
          <StatCard
            label="Overdue"
            value={formatInt(kpis.orders.overdue)}
            href={hrefs.overdue}
            icon={AlertTriangle}
            tone={kpis.orders.overdue > 0 ? "danger" : "default"}
            hint={kpis.orders.overdue > 0 ? "Open orders past their due date" : "Nothing past due"}
          />
          <StatCard label="Due in 7 days" value={formatInt(kpis.orders.dueSoon)} href={hrefs.dueSoon} icon={CalendarClock} hint="Open orders due today through next week" />
          <StatCard label="In progress" value={formatInt(kpis.orders.inProgress)} href={hrefs.inProgress} icon={Activity} hint="Released to the shop floor" />
        </div>
      </div>
      <div>
        <h2 className="mb-3 text-sm font-semibold tracking-wide text-muted-foreground uppercase">Resources</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <StatCard
            label="Machines"
            value={formatInt(kpis.machines.total)}
            href={hrefs.machines}
            icon={Cog}
            hint={
              <>
                {m.active} · {m.maintenance}
                {m.downNow ? (
                  <>
                    {" · "}
                    <span className="font-medium text-red-700">{m.downNow}</span>
                  </>
                ) : null}
              </>
            }
          />
          <StatCard
            label="Materials below reorder"
            value={formatInt(kpis.materialsBelowReorder)}
            href={hrefs.materialsBelowReorder}
            icon={Boxes}
            tone={kpis.materialsBelowReorder > 0 ? "warn" : "default"}
            hint={kpis.materialsBelowReorder > 0 ? "Stock on hand at or below the reorder threshold" : "All materials above threshold"}
          />
        </div>
      </div>
    </div>
  );
}
