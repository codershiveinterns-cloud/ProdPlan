import { Boxes, CalendarClock, ClipboardList, Cog, Play, TriangleAlert } from "lucide-react";

import { Code, KpiTile, MockCard, MockSnippet } from "./frame";

/** Features › Dashboard: the six linked tiles and the recent-activity list. */
const ACTIVITY = [
  { actor: "Priya Nair", text: "changed order", code: "SO-000118", tail: "status Queued → In progress", when: "12 min ago" },
  { actor: "Arun Rao", text: "recorded Issue −18.500 kg", code: "RM-AL6061-BAR", tail: "", when: "1 h ago" },
  { actor: "Meera Iyer", text: "added downtime", code: "CNC-02", tail: "Maintenance 08 Sep 08:00–12:00", when: "3 h ago" },
  { actor: "Priya Nair", text: "imported 38 orders from", code: "orders-sept.csv", tail: "", when: "Yesterday" },
] as const;

export function DashboardSnippet() {
  return (
    <MockSnippet caption="Illustration of the dashboard: six KPI tiles for open, overdue, due-soon and in-progress orders, machines down and materials below reorder, and a recent-activity list with actor, entity and time.">
      <div className="grid grid-cols-2 gap-2 @lg:grid-cols-3">
        <KpiTile label="Open orders" value="24" icon={<ClipboardList />} />
        <KpiTile label="Overdue" value="3" tone="danger" icon={<TriangleAlert />} />
        <KpiTile label="Due in 7 days" value="8" tone="warn" icon={<CalendarClock />} />
        <KpiTile label="In progress" value="5" tone="info" icon={<Play />} />
        <KpiTile label="Machines down now" value="1" hint="of 6 machines" tone="danger" icon={<Cog />} />
        <KpiTile label="Below reorder" value="3" hint="of 12 materials" tone="warn" icon={<Boxes />} />
      </div>
      <MockCard className="mt-2.5">
        <div className="flex items-center justify-between px-3 pt-2.5 pb-1.5">
          <span className="text-[12px] font-semibold text-foreground">Recent activity</span>
          <span className="text-[11px] font-medium text-primary">Audit log</span>
        </div>
        <ul className="divide-y divide-stone-100">
          {ACTIVITY.map((a) => (
            <li key={a.when + a.code} className="flex items-start justify-between gap-3 px-3 py-2 text-[11px] leading-4">
              <span className="min-w-0">
                <span className="font-medium text-foreground">{a.actor}</span> {a.text} <Code className="text-[11px]">{a.code}</Code>
                {a.tail ? <span className="hidden text-stone-600 @sm:inline"> {a.tail}</span> : null}
              </span>
              <span className="shrink-0 text-stone-500">{a.when}</span>
            </li>
          ))}
        </ul>
      </MockCard>
    </MockSnippet>
  );
}
