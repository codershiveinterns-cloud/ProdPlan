import { TrendingUp } from "lucide-react";

import { EmptyState } from "@/components/data/EmptyState";
import type { OnTimeTrendWeek } from "@/lib/analytics/dashboard";
import { formatDate, formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Amber under 80% on-time, otherwise the default bar colour — matches the tone StatCard already uses for risk. */
function barTone(pct: number): string {
  return pct < 80 ? "bg-amber-500" : "bg-primary";
}

/**
 * Weekly on-time-delivery trend as inline CSS bars (docs/M3_SPEC.md §5.3) — no charting library, following the
 * marketing capacity mockup's bar-chart precedent (`src/app/(marketing)/_components/mockups/CapacitySnippet.tsx`).
 */
export function DeliveryTrendChart({ weeks }: { weeks: OnTimeTrendWeek[] }) {
  if (weeks.length === 0) {
    return <EmptyState icon={TrendingUp} size="compact" title="No data in range" />;
  }
  return (
    <div className="flex items-end gap-2 overflow-x-auto pb-1" role="img" aria-label="Weekly on-time delivery rate">
      {weeks.map((w) => {
        const pct = w.onTimePercent;
        return (
          <div key={w.weekStart} className="flex min-w-14 flex-1 flex-col items-center gap-1.5">
            <span className="text-xs font-medium tabular-nums text-foreground">{pct === null ? "—" : formatPercent(pct)}</span>
            <div className="flex h-28 w-full max-w-10 flex-col justify-end overflow-hidden rounded-md bg-muted">
              {pct !== null ? <span className={cn("w-full rounded-t-sm", barTone(pct))} style={{ height: `${Math.max(4, pct)}%` }} /> : null}
            </div>
            <span className="text-[11px] text-muted-foreground">{formatDate(w.weekStart)}</span>
            <span className="text-[10px] text-muted-foreground">{w.completed} done</span>
          </div>
        );
      })}
    </div>
  );
}
