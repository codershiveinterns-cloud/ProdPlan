"use client";

/**
 * `/schedule` toolbar (docs/M2_SPEC.md §3): window nav (‹ today ›, day-count select), work-center filter,
 * "Run schedule" (schedule:run), conflicts badge → /schedule/conflicts, "last run" relative time.
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, ChevronLeft, ChevronRight } from "lucide-react";

import { RunScheduleButton } from "./RunScheduleButton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export type ScheduleToolbarProps = {
  from: string;
  days: number;
  workCenterId?: string;
  prevHref: string;
  todayHref: string;
  nextHref: string;
  windowLabel: string;
  workCenters: { id: string; code: string; name: string }[];
  conflictCount: number;
  lastRunLabel: string;
  canRun: boolean;
};

const DAY_OPTIONS = [7, 14, 30] as const;

function buildHref(from: string, days: number, workCenterId?: string): string {
  const q = new URLSearchParams();
  q.set("from", from);
  q.set("days", String(days));
  if (workCenterId) q.set("workCenterId", workCenterId);
  return `/schedule?${q.toString()}`;
}

export function ScheduleToolbar({
  from,
  days,
  workCenterId,
  prevHref,
  todayHref,
  nextHref,
  windowLabel,
  workCenters,
  conflictCount,
  lastRunLabel,
  canRun,
}: ScheduleToolbarProps) {
  const router = useRouter();

  return (
    <div className="mb-4 flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1 rounded-lg border border-input bg-card p-1">
          <Button variant="ghost" size="icon" asChild aria-label="Previous window">
            <Link href={prevHref}>
              <ChevronLeft />
            </Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link href={todayHref}>Today</Link>
          </Button>
          <Button variant="ghost" size="icon" asChild aria-label="Next window">
            <Link href={nextHref}>
              <ChevronRight />
            </Link>
          </Button>
        </div>

        <span className="text-sm font-medium text-foreground">{windowLabel}</span>

        <Select value={String(days)} onValueChange={(v) => router.push(buildHref(from, Number(v), workCenterId))}>
          <SelectTrigger className="w-28" aria-label="Window length">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {DAY_OPTIONS.map((d) => (
              <SelectItem key={d} value={String(d)}>
                {d} days
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={workCenterId ?? "all"}
          onValueChange={(v) => router.push(buildHref(from, days, v === "all" ? undefined : v))}
        >
          <SelectTrigger className="w-52" aria-label="Work center">
            <SelectValue placeholder="All work centers" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All work centers</SelectItem>
            {workCenters.map((wc) => (
              <SelectItem key={wc.id} value={wc.id}>
                {wc.code} · {wc.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="ml-auto flex flex-wrap items-center gap-3">
          <span className="text-xs text-muted-foreground">Last run {lastRunLabel}</span>
          <Button variant="outline" asChild>
            <Link href="/schedule/conflicts">
              <AlertTriangle data-icon="inline-start" />
              Conflicts
              {conflictCount > 0 ? (
                <Badge variant="destructive" className="ml-1">
                  {conflictCount}
                </Badge>
              ) : null}
            </Link>
          </Button>
          {canRun ? <RunScheduleButton /> : null}
        </div>
      </div>
    </div>
  );
}
