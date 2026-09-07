import { Boxes, CalendarClock, ClipboardList, TriangleAlert } from "lucide-react";

import { DueHint } from "@/components/data/DueHint";
import { MachineStatusBadge } from "@/components/data/MachineStatusBadge";
import { PriorityBadge } from "@/components/data/PriorityBadge";
import { StatusBadge } from "@/components/data/StatusBadge";
import type { OrderPriority, OrderStatus } from "@/generated/prisma/enums";
import { cn } from "@/lib/utils";

import { BrowserFrame, Code, KpiTile, MockCard, MockTable } from "./frame";

/*
 * Hero mockup — the ProdPlan dashboard for the demo plant inside a browser frame (docs/LANDING_REFERENCE.md §2 #1).
 * Uses the app's real badge components so colours and geometry match the product exactly. `today` is fixed to the
 * date the copy describes so DueHint renders identically on server and client.
 */
const TODAY = "2026-09-07";

const ORDERS: ReadonlyArray<{
  no: string;
  customer: string;
  product: string;
  qty: string;
  due: string;
  priority: OrderPriority;
  status: OrderStatus;
}> = [
  { no: "SO-000118", customer: "Vikram Auto", product: "HB-200 Hydraulic Bracket", qty: "250 pcs", due: "2026-09-09", priority: "HIGH", status: "IN_PROGRESS" },
  { no: "SO-000121", customer: "Deccan Motors", product: "GX-40 Gearbox Housing", qty: "120 pcs", due: "2026-09-04", priority: "URGENT", status: "QUEUED" },
  { no: "SO-000123", customer: "Kaveri Pumps", product: "PF-12 Pump Flange", qty: "400 pcs", due: "2026-09-08", priority: "NORMAL", status: "QUEUED" },
  { no: "SO-000119", customer: "Nilgiri Tools", product: "HB-200 Hydraulic Bracket", qty: "180 pcs", due: "2026-09-12", priority: "NORMAL", status: "ON_HOLD" },
];

const MACHINES = [
  { code: "CNC-01", name: "Haas VF-2", minutes: 855, downtime: 0, status: "ACTIVE", down: null },
  { code: "CNC-02", name: "Haas VF-2", minutes: 570, downtime: 240, status: "ACTIVE", down: { type: "MAINTENANCE", until: "12:00" } },
  { code: "ASM-01", name: "Assembly bench", minutes: 810, downtime: 0, status: "ACTIVE", down: null },
] as const;

export function DashboardMockup({ className }: { className?: string }) {
  return (
    <div className={cn("relative", className)}>
      <BrowserFrame
        url="acme.prodplan.app/dashboard"
        tabs={["Acme Precision", "Beta Fab"]}
        caption="Illustration of the ProdPlan dashboard for a demo plant: KPI tiles for open, overdue and due-soon orders and materials below reorder; an orders-by-due-date table with priority and status badges; today's available minutes per machine with a maintenance window; and a chip flagging a material below its reorder threshold."
      >
        <div className="flex flex-col gap-3 bg-background p-3 @md:p-4">
          <div className="flex items-end justify-between gap-3">
            <div>
              <div className="text-[15px] leading-5 font-semibold text-foreground">Dashboard</div>
              <div className="text-[11px] text-stone-500">Monday, 07 Sep 2026 · Acme Precision Works</div>
            </div>
            <span className="hidden h-7 items-center rounded-md bg-primary px-2.5 text-[11px] font-medium text-white @sm:inline-flex">+ New</span>
          </div>

          <div className="grid grid-cols-2 gap-2 @lg:grid-cols-4 @md:gap-3">
            <KpiTile label="Open orders" value="24" icon={<ClipboardList />} iconClassName="hidden @2xl:flex" />
            <KpiTile label="Overdue" value="3" tone="warn" icon={<TriangleAlert />} iconClassName="hidden @2xl:flex" />
            <KpiTile label="Due in 7 days" value="8" icon={<CalendarClock />} iconClassName="hidden @2xl:flex" />
            <KpiTile label="Below reorder" value="3" tone="warn" icon={<Boxes />} iconClassName="hidden @2xl:flex" />
          </div>

          <MockCard>
            <div className="flex items-center justify-between gap-2 px-3 py-2">
              <span className="text-xs font-semibold text-foreground">Orders by due date</span>
              <span className="text-[11px] font-medium text-primary">View all 24</span>
            </div>
            <MockTable
              head={
                <>
                  <th>Order #</th>
                  <th className="hidden @md:table-cell">Customer</th>
                  <th className="hidden @3xl:table-cell">Product</th>
                  <th className="hidden text-right @sm:table-cell">Qty</th>
                  <th>Due</th>
                  <th className="hidden @xl:table-cell">Priority</th>
                  <th>Status</th>
                </>
              }
            >
              {ORDERS.map((o, i) => (
                <tr key={o.no} className={cn(i === 1 && "bg-red-50/40", i === 3 && "hidden @md:table-row")}>
                  <td>
                    <Code>{o.no}</Code>
                  </td>
                  <td className="hidden text-stone-700 @md:table-cell">{o.customer}</td>
                  <td className="hidden max-w-[11rem] truncate text-stone-700 @3xl:table-cell">{o.product}</td>
                  <td className="hidden text-right text-foreground @sm:table-cell">{o.qty}</td>
                  <td>
                    <DueHint dueDate={o.due} today={TODAY} className="text-[12px]" />
                  </td>
                  <td className="hidden @xl:table-cell">
                    <PriorityBadge priority={o.priority} />
                  </td>
                  <td>
                    <StatusBadge status={o.status} />
                  </td>
                </tr>
              ))}
            </MockTable>
          </MockCard>

          <MockCard className="p-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <div className="text-xs font-semibold text-foreground">Machines · today</div>
                <div className="text-[10px] text-stone-500">Net shift minutes × efficiency − downtime</div>
              </div>
              <span className="hidden text-[11px] font-medium text-primary @sm:inline">View machines</span>
            </div>
            <ul className="mt-2.5 flex flex-col gap-2">
              {MACHINES.map((m) => (
                <li key={m.code} className="grid grid-cols-[4.5rem_1fr_auto] items-center gap-3 @sm:grid-cols-[5rem_1fr_auto]">
                  <div className="min-w-0">
                    <Code className="text-[11px]">{m.code}</Code>
                    <div className="hidden truncate text-[10px] text-stone-500 @sm:block">{m.name}</div>
                  </div>
                  <div className="min-w-0">
                    <div className="flex h-2 w-full overflow-hidden rounded-full bg-muted">
                      <span className="h-full bg-teal-600" style={{ width: `${(m.minutes / 900) * 100}%` }} />
                      {m.downtime ? <span className="h-full bg-amber-400" style={{ width: `${(m.downtime / 900) * 100}%` }} /> : null}
                    </div>
                    <div className="mt-1 text-[10px] text-stone-500">
                      <span className="font-semibold text-foreground">{m.minutes}</span> min available
                    </div>
                  </div>
                  <MachineStatusBadge status={m.status} activeDowntime={m.down} className="justify-end [&_span]:text-[10px]" />
                </li>
              ))}
            </ul>
          </MockCard>
        </div>
      </BrowserFrame>

      {/* Floating "below reorder" chip: slides in after the mockup has faded in. */}
      <div
        aria-hidden="true"
        className="animate-float-in delay-900 absolute -right-2 -bottom-6 flex items-center gap-3 rounded-xl bg-white p-3 pr-4 shadow-[0_12px_32px_-8px_rgb(28_25_23_/_0.3)] ring-1 ring-stone-900/10 sm:-right-5 sm:-bottom-7"
      >
        <span className="flex size-9 items-center justify-center rounded-lg bg-amber-50 text-amber-700">
          <Boxes className="size-4" />
        </span>
        <span className="leading-tight">
          <span className="block font-mono text-[11px] font-semibold text-foreground">RM-AL6061-BAR</span>
          <span className="block text-[11px] text-stone-600">
            <span className="font-semibold text-amber-700">Below reorder</span> · 38.500 kg on hand
          </span>
        </span>
      </div>
    </div>
  );
}
