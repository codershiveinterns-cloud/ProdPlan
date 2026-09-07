import { Boxes, CalendarClock, ClipboardList, Cog, TriangleAlert } from "lucide-react";

import { Code, KpiTile, MockCard, MockSnippet } from "./frame";

const ACTIVITY = [
  { actor: "Priya Nair", verb: "changed order", entity: "SO-000118", detail: "status Queued → In progress", when: "12 min ago" },
  { actor: "Arun Rao", verb: "recorded Issue", entity: "RM-AL6061-BAR", detail: "−18.500 kg", when: "1 h ago" },
  { actor: "Meera Iyer", verb: "added downtime", entity: "CNC-02", detail: "Maintenance 08 Sep 08:00–12:00", when: "3 h ago" },
] as const;

/** Feature 6 — Mockup A cropped to the KPI tiles and the recent-activity list (brief §8.2). */
export function DashboardSnippet() {
  return (
    <MockSnippet caption="Illustration of the dashboard's KPI tiles — open, overdue and due-soon orders, machines and materials below reorder — with a recent-activity list naming who changed what and when.">
      <div className="grid grid-cols-2 gap-2 @md:grid-cols-3">
        <KpiTile label="Open orders" value="24" icon={<ClipboardList />} />
        <KpiTile label="Overdue" value="6" tone="danger" icon={<TriangleAlert />} />
        <KpiTile label="Due in 7 days" value="8" tone="warn" icon={<CalendarClock />} />
        <KpiTile label="Machines" value="6" hint="4 active · 1 in maintenance · 1 down now" icon={<Cog />} />
        <KpiTile label="Below reorder" value="3" tone="warn" icon={<Boxes />} className="col-span-2 @md:col-span-1" />
      </div>

      <MockCard className="mt-2.5">
        <div className="px-3 pt-2.5 pb-1 text-[12px] font-semibold text-foreground">Recent activity</div>
        <ul className="divide-y divide-stone-100">
          {ACTIVITY.map((a) => (
            <li key={a.entity} className="flex items-start justify-between gap-3 px-3 py-2 text-[11px] leading-4">
              <span className="min-w-0 text-muted-foreground">
                <span className="font-medium text-foreground">{a.actor}</span> {a.verb} <Code className="text-[11px]">{a.entity}</Code>{" "}
                <span className="hidden @sm:inline">{a.detail}</span>
              </span>
              <span className="shrink-0 text-stone-500">{a.when}</span>
            </li>
          ))}
        </ul>
      </MockCard>
    </MockSnippet>
  );
}
