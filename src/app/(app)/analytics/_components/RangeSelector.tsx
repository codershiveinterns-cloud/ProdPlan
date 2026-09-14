import Link from "next/link";

import type { AnalyticsRange, AnalyticsRangePreset } from "@/lib/analytics/dashboard";
import { cn } from "@/lib/utils";

import { ANALYTICS_RANGE_PRESETS, analyticsPresetHref, isActivePreset } from "../params";

const PRESET_LABELS: Record<AnalyticsRangePreset, string> = { 7: "7 days", 30: "30 days", 90: "90 days" };

/** Plain GET links, no JS — matches the planning board's `?from=&days=` window-nav precedent. */
export function RangeSelector({ range, todayIso }: { range: AnalyticsRange; todayIso: string }) {
  return (
    <div role="group" aria-label="Date range" className="inline-flex items-center gap-1 rounded-lg bg-muted p-1">
      {ANALYTICS_RANGE_PRESETS.map((preset) => {
        const active = isActivePreset(range, preset, todayIso);
        return (
          <Link
            key={preset}
            href={analyticsPresetHref(preset, todayIso)}
            aria-current={active ? "true" : undefined}
            className={cn(
              "inline-flex h-9 min-w-11 items-center justify-center rounded-md px-3 text-sm font-medium transition-colors",
              active ? "bg-card text-foreground shadow-sm ring-1 ring-foreground/10" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {PRESET_LABELS[preset]}
          </Link>
        );
      })}
    </div>
  );
}
