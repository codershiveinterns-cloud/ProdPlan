import {
  Boxes,
  CalendarClock,
  ClipboardList,
  Cog,
  Factory,
  LayoutDashboard,
  Package,
  Play,
  Settings,
  TriangleAlert,
  Users,
} from "lucide-react";

import { cn } from "@/lib/utils";

import { BrandMark } from "../ui";
import { Code, Due, KpiTile, MockCard, MockFrame, MockTable, Pill } from "./frame";

/*
 * Mockup A — the planning dashboard for "Acme Precision Works" (docs/DESIGN_BRIEF.md §8.2), extended with a
 * machine-capacity strip. Responsive to its own width via container queries: the sidebar appears from 42 rem,
 * table columns fill in from 24 / 28 rem, KPI tiles go 2 → 4 across at 32 rem.
 */

const NAV = [
  { group: "Plan", items: [{ label: "Dashboard", icon: LayoutDashboard, active: true }, { label: "Orders", icon: ClipboardList }] },
  {
    group: "Master data",
    items: [
      { label: "Customers", icon: Users },
      { label: "Products", icon: Package },
      { label: "Materials", icon: Boxes },
      { label: "Machines", icon: Cog },
      { label: "Work centers", icon: Factory },
      { label: "Shift calendars", icon: CalendarClock },
    ],
  },
  { group: "Settings", items: [{ label: "Settings", icon: Settings }] },
] as const;

const ORDERS = [
  { no: "SO-000118", customer: "Bharat Autotech", product: "HB-200 Hydraulic Bracket", qty: "250 pcs", due: "Overdue 3d", dueTone: "overdue", priority: "High", priorityTone: "high", status: "In progress", statusTone: "inProgress" },
  { no: "SO-000121", customer: "Deccan Motors", product: "GX-40 Gearbox Housing", qty: "120 pcs", due: "Due today", dueTone: "soon", priority: "Urgent", priorityTone: "urgent", status: "Queued", statusTone: "queued" },
  { no: "SO-000123", customer: "Kaveri Pumps", product: "PF-12 Pump Flange", qty: "400 pcs", due: "Due tomorrow", dueTone: "soon", priority: "Normal", priorityTone: "normal", status: "Queued", statusTone: "queued" },
  { no: "SO-000119", customer: "Nilgiri Tools", product: "HB-200 Hydraulic Bracket", qty: "180 pcs", due: "Due in 3d", dueTone: "upcoming", priority: "Normal", priorityTone: "normal", status: "On hold", statusTone: "onHold" },
] as const;

/** Today's available minutes per machine on a 900-minute scale (two 8 h shifts, 30 min break each, × efficiency). */
const CAPACITY = [
  { code: "CNC-01", name: "Haas VF-2", available: 855, downtime: 0, note: "2 shifts · 95 %" },
  { code: "CNC-02", name: "Haas VF-2", available: 570, downtime: 240, note: "Maint. 08–12" },
  { code: "CNC-03", name: "DMG Mori", available: 0, downtime: 0, note: "In maintenance", idle: true },
  { code: "ASM-01", name: "Assembly bench", available: 810, downtime: 0, note: "2 shifts · 90 %" },
] as const;

export function DashboardMockup({ className }: { className?: string }) {
  return (
    <MockFrame
      caption="Illustration of the ProdPlan dashboard for a demo plant: KPI tiles for open, overdue, due-soon and in-progress orders, an orders-by-due-date table with priority and status badges, and today's available minutes per machine."
      className={className}
    >
      <div className="flex min-h-[26rem]">
        {/* Sidebar */}
        <div className="hidden w-40 shrink-0 flex-col border-r border-border bg-white @2xl:flex">
          <div className="flex h-12 items-center gap-2 border-b border-border px-3">
            <BrandMark size={24} />
            <div className="min-w-0 leading-tight">
              <div className="text-xs font-semibold text-foreground">ProdPlan</div>
              <div className="truncate text-[10px] text-stone-500">Acme Precision Works</div>
            </div>
          </div>
          <div className="flex flex-col gap-3 px-2 py-3">
            {NAV.map((group) => (
              <div key={group.group}>
                <div className="px-2 pb-1 text-[9px] font-semibold tracking-wider text-stone-500 uppercase">{group.group}</div>
                <ul className="flex flex-col gap-0.5">
                  {group.items.map((item) => {
                    const Icon = item.icon;
                    const active = "active" in item && item.active;
                    return (
                      <li
                        key={item.label}
                        className={cn(
                          "flex h-7 items-center gap-2 rounded-md px-2 text-[11px] font-medium",
                          active ? "bg-primary-soft text-primary-soft-foreground" : "text-stone-700",
                        )}
                      >
                        <Icon className={cn("size-3.5 shrink-0", active ? "text-primary" : "text-stone-400")} />
                        <span className="truncate">{item.label}</span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        </div>

        {/* Main column */}
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex h-12 items-center justify-between gap-3 border-b border-border bg-white px-3 @md:px-4">
            <div className="flex min-w-0 items-center gap-2">
              <span className="flex size-7 items-center justify-center rounded-md bg-muted @2xl:hidden">
                <span className="block h-0.5 w-3.5 rounded bg-stone-500 shadow-[0_-4px_0_0_#78716c,0_4px_0_0_#78716c]" />
              </span>
              <span className="truncate text-xs font-semibold text-foreground">Acme Precision Works</span>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <span className="inline-flex h-7 items-center rounded-md bg-primary px-2.5 text-[11px] font-medium text-white">
                + New
              </span>
              <span className="flex size-7 items-center justify-center rounded-full bg-teal-100 text-[10px] font-semibold text-teal-900">
                AR
              </span>
            </div>
          </div>

          <div className="flex flex-1 flex-col gap-3 p-3 @md:p-4">
            <div>
              <div className="text-base leading-6 font-semibold text-foreground">Dashboard</div>
              <div className="text-[11px] text-stone-500">Monday, 07 Sep 2026 · Asia/Kolkata</div>
            </div>

            <div className="grid grid-cols-2 gap-2 @lg:grid-cols-4 @md:gap-3">
              <KpiTile label="Open orders" value="24" icon={<ClipboardList />} iconClassName="hidden @3xl:flex" />
              <KpiTile label="Overdue" value="6" tone="danger" icon={<TriangleAlert />} iconClassName="hidden @3xl:flex" />
              <KpiTile label="Due in 7 days" value="8" tone="warn" icon={<CalendarClock />} iconClassName="hidden @3xl:flex" />
              <KpiTile label="In progress" value="5" tone="info" icon={<Play />} iconClassName="hidden @3xl:flex" />
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
                    <th className="hidden @lg:table-cell">Customer</th>
                    <th className="hidden @4xl:table-cell">Product</th>
                    <th className="hidden text-right @sm:table-cell">Qty</th>
                    <th>Due</th>
                    <th className="hidden @3xl:table-cell">Priority</th>
                    <th>Status</th>
                  </>
                }
              >
                {ORDERS.map((o, i) => (
                  <tr key={o.no} className={cn(i === 0 && "bg-red-50/40", i === 3 && "hidden @lg:table-row")}>
                    <td>
                      <Code>{o.no}</Code>
                    </td>
                    <td className="hidden text-stone-700 @lg:table-cell">{o.customer}</td>
                    <td className="hidden max-w-[11rem] truncate text-stone-700 @4xl:table-cell">{o.product}</td>
                    <td className="hidden text-right text-foreground @sm:table-cell">{o.qty}</td>
                    <td>
                      <Due tone={o.dueTone}>{o.due}</Due>
                    </td>
                    <td className="hidden @3xl:table-cell">
                      <Pill tone={o.priorityTone}>{o.priority}</Pill>
                    </td>
                    <td>
                      <Pill tone={o.statusTone}>{o.status}</Pill>
                    </td>
                  </tr>
                ))}
              </MockTable>
            </MockCard>

            <MockCard className="p-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="text-xs font-semibold text-foreground">Machine capacity · today</div>
                  <div className="text-[10px] text-stone-500">Net shift minutes × efficiency − downtime</div>
                </div>
                <span className="hidden text-[11px] font-medium text-primary @sm:inline">View machines</span>
              </div>
              <ul className="mt-2.5 grid grid-cols-2 gap-x-4 gap-y-2.5 @lg:grid-cols-4">
                {CAPACITY.map((m) => {
                  const avail = (m.available / 900) * 100;
                  const down = (m.downtime / 900) * 100;
                  return (
                    <li key={m.code} className="min-w-0">
                      <div className="flex items-baseline justify-between gap-2">
                        <Code className="text-[11px]">{m.code}</Code>
                        <span className={cn("text-[11px] font-semibold", "idle" in m ? "text-stone-400" : "text-foreground")}>
                          {"idle" in m ? "0" : m.available} <span className="font-normal text-stone-500">min</span>
                        </span>
                      </div>
                      <div
                        className={cn(
                          "mt-1 flex h-2 w-full overflow-hidden rounded-full bg-muted",
                          "idle" in m && "border border-dashed border-stone-300 bg-transparent",
                        )}
                      >
                        <span className="h-full bg-teal-600" style={{ width: `${avail}%` }} />
                        {down > 0 ? <span className="h-full bg-amber-400" style={{ width: `${down}%` }} /> : null}
                      </div>
                      <div className="mt-1 truncate text-[10px] text-stone-500">{m.note}</div>
                    </li>
                  );
                })}
              </ul>
            </MockCard>
          </div>
        </div>
      </div>
    </MockFrame>
  );
}
