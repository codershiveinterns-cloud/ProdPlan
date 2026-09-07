import type { ReactNode } from "react";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { ArrowRight } from "lucide-react";

import { cn } from "@/lib/utils";

export type StatCardTone = "default" | "warn" | "danger";

export type StatCardProps = {
  label: string;
  value: ReactNode;
  /** Secondary line, e.g. "5 active · 1 in maintenance · 2 down now". */
  hint?: ReactNode;
  /** Makes the whole card a link to the identically-filtered list. */
  href?: string;
  /** Amber / red emphasis; the dashboard uses it only when the count is > 0. */
  tone?: StatCardTone;
  icon?: LucideIcon;
  className?: string;
};

const TONE: Record<StatCardTone, { value: string; ring: string; icon: string }> = {
  default: { value: "text-foreground", ring: "ring-foreground/10", icon: "bg-muted text-muted-foreground" },
  warn: { value: "text-amber-700", ring: "ring-amber-200", icon: "bg-amber-50 text-amber-700" },
  danger: { value: "text-red-700", ring: "ring-red-200", icon: "bg-red-50 text-red-700" },
};

/** KPI tile for the dashboard. Renders as a Link when `href` is given. */
export function StatCard({ label, value, hint, href, tone = "default", icon: Icon, className }: StatCardProps) {
  const t = TONE[tone];
  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-medium text-muted-foreground">{label}</div>
          <div data-slot="stat-card-value" className={cn("mt-1 text-3xl font-semibold tracking-tight", t.value)}>
            {value}
          </div>
        </div>
        {Icon ? (
          <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-lg", t.icon)}>
            <Icon className="size-5" aria-hidden="true" />
          </span>
        ) : null}
      </div>
      {hint || href ? (
        <div className="mt-3 flex items-center justify-between gap-2 text-sm text-muted-foreground">
          <span className="truncate">{hint}</span>
          {href ? (
            <ArrowRight
              className="size-4 shrink-0 transition-transform group-hover/stat:translate-x-0.5"
              aria-hidden="true"
            />
          ) : null}
        </div>
      ) : null}
    </>
  );

  const classes = cn(
    "group/stat flex min-h-28 flex-col justify-between rounded-xl bg-card p-4 text-left ring-1",
    t.ring,
    href && "outline-none transition-shadow hover:ring-2 hover:ring-primary/40 focus-visible:ring-3 focus-visible:ring-ring/50",
    className,
  );

  return href ? (
    <Link href={href} className={classes} aria-label={`${label}: open list`}>
      {body}
    </Link>
  ) : (
    <div className={classes}>{body}</div>
  );
}
