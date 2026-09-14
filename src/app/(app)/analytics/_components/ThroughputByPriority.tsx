import { PriorityBadge } from "@/components/data/PriorityBadge";
import { formatInt } from "@/lib/format";
import { THROUGHPUT_PRIORITIES, type ThroughputByPriority as ThroughputByPriorityData } from "@/lib/analytics/dashboard";

/** COMPLETED orders in range, grouped by priority (docs/M3_SPEC.md §5.5) — a small bar set, URGENT first. */
export function ThroughputByPriority({ counts }: { counts: ThroughputByPriorityData }) {
  const max = Math.max(1, ...THROUGHPUT_PRIORITIES.map((p) => counts[p]));
  return (
    <ul className="flex flex-col gap-3">
      {THROUGHPUT_PRIORITIES.map((priority) => {
        const value = counts[priority];
        return (
          <li key={priority} className="flex items-center gap-3">
            <PriorityBadge priority={priority} className="w-20 justify-center" />
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
              <span className="block h-full rounded-full bg-primary" style={{ width: `${(value / max) * 100}%` }} />
            </div>
            <span className="w-8 shrink-0 text-right text-sm tabular-nums text-foreground">{formatInt(value)}</span>
          </li>
        );
      })}
    </ul>
  );
}
