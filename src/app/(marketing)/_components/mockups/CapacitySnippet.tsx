import { cn } from "@/lib/utils";

import { Code, MockCard, MockSnippet, Pill } from "./frame";

/*
 * Mockup B — "Capacity — next 7 days" for CNC-02 (brief §8.3). Day 06:00–14:00 and Evening 14:00–22:00, 30-min break
 * each → (450 + 450) × 0.90 = 810 min; Tuesday maintenance 08:00–12:00 removes 240; Friday is a holiday exception;
 * Sunday is not in the calendar's daysOfWeek.
 */
const DAYS = [
  { day: "Mon", date: "07", available: 810, downtime: 0, note: "2 shifts" },
  { day: "Tue", date: "08", available: 570, downtime: 240, note: "Maint. 08–12" },
  { day: "Wed", date: "09", available: 810, downtime: 0, note: "2 shifts" },
  { day: "Thu", date: "10", available: 810, downtime: 0, note: "2 shifts" },
  { day: "Fri", date: "11", available: 0, downtime: 0, note: "Holiday", off: true },
  { day: "Sat", date: "12", available: 810, downtime: 0, note: "2 shifts" },
  { day: "Sun", date: "13", available: 0, downtime: 0, note: "Non-working", off: true },
] as const;

const SCALE = 900;

export function CapacitySnippet() {
  return (
    <MockSnippet caption="Illustration of a machine's capacity for the next seven days: available minutes per day drawn as bars, with a maintenance window, a holiday and a non-working Sunday shown.">
      <MockCard className="p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <Code className="font-semibold">CNC-02</Code>
            <span className="ml-1.5 text-[11px] text-stone-500">Haas VF-2 · CNC · Two shifts</span>
          </div>
          <div className="flex items-center gap-2">
            <Pill tone="active">Active</Pill>
            <span className="text-[11px] text-stone-500">Efficiency 90 %</span>
          </div>
        </div>

        <div className="mt-3">
          <div className="text-[12px] font-semibold text-foreground">Capacity — next 7 days</div>
          <div className="text-[10px] text-stone-500">Net shift minutes × efficiency − downtime</div>
        </div>

        <ul className="mt-3 grid grid-cols-7 gap-1.5 @sm:gap-2.5">
          {DAYS.map((d) => {
            const off = "off" in d && d.off;
            const availPct = (d.available / SCALE) * 100;
            const downPct = (d.downtime / SCALE) * 100;
            return (
              <li key={d.day} className="flex min-w-0 flex-col items-center">
                <div className="text-[10px] text-stone-500">{d.day}</div>
                <div className="text-[11px] font-medium text-foreground">{d.date}</div>
                <div
                  className={cn(
                    "mt-1.5 flex h-24 w-full max-w-8 flex-col justify-end overflow-hidden rounded-md bg-muted",
                    off && "border border-dashed border-stone-300 bg-transparent",
                  )}
                >
                  {downPct > 0 ? <span className="w-full bg-amber-400" style={{ height: `${downPct}%` }} /> : null}
                  <span className="w-full bg-teal-600" style={{ height: `${availPct}%` }} />
                </div>
                <div className={cn("mt-1.5 text-[11px] font-medium", off ? "text-stone-400" : "text-foreground")}>
                  {d.available}
                </div>
                <div className="hidden max-w-full truncate text-[9px] text-stone-500 @sm:block">{d.note}</div>
              </li>
            );
          })}
        </ul>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 border-t border-stone-100 pt-2.5 text-[10px] text-stone-500">
          <span>
            Week total <span className="font-semibold text-foreground">3,810 min</span> · Downtime 240 min · 1 holiday
          </span>
          <span className="flex items-center gap-2.5">
            <span className="flex items-center gap-1">
              <span className="size-2 rounded-full bg-teal-600" /> Available
            </span>
            <span className="flex items-center gap-1">
              <span className="size-2 rounded-full bg-amber-400" /> Downtime
            </span>
            <span className="flex items-center gap-1">
              <span className="size-2 rounded-full bg-stone-200" /> Non-working
            </span>
          </span>
        </div>
      </MockCard>
    </MockSnippet>
  );
}
