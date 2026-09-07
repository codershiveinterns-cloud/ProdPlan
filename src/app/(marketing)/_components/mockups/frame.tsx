import type { ComponentProps, ReactNode } from "react";

import { cn } from "@/lib/utils";

/*
 * Shared pieces for the drawn product mockups (docs/DESIGN_BRIEF.md §8). Everything is plain markup at 12–13 px
 * with the app's exact colour classes, so the illustrations match the real UI without importing it. Mockups are
 * decorative: the `<figure>` carries a short caption for screen readers and the drawing itself is `aria-hidden`.
 */

/** Framed illustration: rounded-2xl, ring, one long soft shadow, container-query context for its children. */
export function MockFrame({
  caption,
  className,
  children,
  shadow = true,
}: {
  caption: string;
  className?: string;
  children: ReactNode;
  shadow?: boolean;
}) {
  return (
    <figure className={cn("relative m-0", className)}>
      <div
        aria-hidden="true"
        className={cn(
          "@container overflow-hidden rounded-2xl bg-background text-[13px] leading-tight text-stone-700 ring-1 ring-foreground/10 [font-variant-numeric:tabular-nums]",
          shadow && "shadow-[0_32px_64px_-32px_rgb(28_25_23_/_0.35)]",
        )}
      >
        {children}
      </div>
      <figcaption className="sr-only">{caption}</figcaption>
    </figure>
  );
}

/** Compact snippet frame for feature cards: same look, smaller radius, no drop shadow. */
export function MockSnippet({
  caption,
  className,
  children,
}: {
  caption: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <figure className={cn("relative m-0", className)}>
      <div
        aria-hidden="true"
        className="@container overflow-hidden rounded-xl bg-background p-3 text-xs leading-tight text-stone-700 ring-1 ring-foreground/10 [font-variant-numeric:tabular-nums]"
      >
        {children}
      </div>
      <figcaption className="sr-only">{caption}</figcaption>
    </figure>
  );
}

/** Colour maps copied from StatusBadge / PriorityBadge / MachineStatusBadge so mockups match the app exactly. */
export const PILL = {
  queued: "border-slate-200 bg-slate-100 text-slate-700",
  inProgress: "border-blue-200 bg-blue-50 text-blue-700",
  onHold: "border-amber-200 bg-amber-50 text-amber-800",
  completed: "border-green-200 bg-green-50 text-green-700",
  low: "border-gray-300 bg-transparent text-gray-600",
  normal: "border-slate-200 bg-slate-100 text-slate-700",
  high: "border-orange-200 bg-orange-50 text-orange-700",
  urgent: "border-red-600 bg-red-600 text-white",
  active: "border-green-200 bg-green-50 text-green-700",
  inactive: "border-gray-300 bg-gray-100 text-gray-600",
  maintenance: "border-amber-200 bg-amber-50 text-amber-800",
  down: "border-red-200 bg-red-50 text-red-700",
  short: "border-red-200 bg-red-50 text-red-700",
  covered: "border-green-200 bg-green-50 text-green-700",
  belowReorder: "border-amber-200 bg-amber-50 text-amber-800",
  valid: "border-green-200 bg-green-50 text-green-700",
  errors: "border-red-200 bg-red-50 text-red-700",
  warning: "border-amber-200 bg-amber-50 text-amber-800",
  info: "border-teal-200 bg-primary-soft text-primary-soft-foreground",
} as const;

export type PillTone = keyof typeof PILL;

/** Outline pill, `h-5 px-2 text-xs font-medium` — identical geometry to the app's Badge. */
export function Pill({ tone, className, children }: { tone: PillTone; className?: string; children: ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex h-5 shrink-0 items-center rounded-full border px-2 text-[11px] font-medium whitespace-nowrap",
        PILL[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Monospace code (order numbers, machine and material codes). */
export function Code({ className, ...props }: ComponentProps<"span">) {
  return <span className={cn("font-mono text-[12px] whitespace-nowrap text-foreground", className)} {...props} />;
}

export const DUE_TONE = {
  overdue: "font-medium text-red-700",
  soon: "font-medium text-amber-700",
  upcoming: "text-foreground",
  later: "text-stone-500",
} as const;

/** Due hint text with the DueHint colour semantics. */
export function Due({ tone, children }: { tone: keyof typeof DUE_TONE; children: ReactNode }) {
  return <span className={cn("whitespace-nowrap", DUE_TONE[tone])}>{children}</span>;
}

/** White card with the app's `ring-1 ring-foreground/10` frame. */
export function MockCard({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("overflow-hidden rounded-xl bg-white ring-1 ring-foreground/10", className)} {...props} />;
}

/** Table shell: stone-100 header, 13 px, 36 px rows, right-aligned numbers via `num`. */
export function MockTable({
  head,
  children,
  className,
}: {
  head: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <table className={cn("w-full border-collapse text-left text-[12px] [font-variant-numeric:tabular-nums]", className)}>
      <thead>
        <tr className="bg-muted text-[11px] font-medium text-muted-foreground [&>th]:h-8 [&>th]:px-2 [&>th]:font-medium [&>th]:whitespace-nowrap [&>th:first-child]:pl-3 [&>th:last-child]:pr-3">
          {head}
        </tr>
      </thead>
      <tbody className="[&>tr]:border-t [&>tr]:border-stone-100 [&>tr>td]:h-9 [&>tr>td]:px-2 [&>tr>td]:whitespace-nowrap [&>tr>td:first-child]:pl-3 [&>tr>td:last-child]:pr-3">
        {children}
      </tbody>
    </table>
  );
}

/** KPI tile in the dashboard mockup: label 11 px stone-500, value 22 px semibold, tone as in StatCard. */
export function KpiTile({
  label,
  value,
  hint,
  tone = "default",
  icon,
  className,
  iconClassName,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "warn" | "danger" | "info";
  icon: ReactNode;
  className?: string;
  /** Lets a dense 4-across row hide the chip until the container is wide enough (`hidden @3xl:flex`). */
  iconClassName?: string;
}) {
  const tones = {
    default: { value: "text-foreground", ring: "ring-foreground/10", chip: "bg-muted text-stone-500" },
    warn: { value: "text-amber-700", ring: "ring-amber-200", chip: "bg-amber-50 text-amber-700" },
    danger: { value: "text-red-700", ring: "ring-red-200", chip: "bg-red-50 text-red-700" },
    info: { value: "text-blue-700", ring: "ring-foreground/10", chip: "bg-blue-50 text-blue-700" },
  } as const;
  const t = tones[tone];
  return (
    <div className={cn("flex items-start justify-between gap-2 rounded-[10px] bg-white p-3 ring-1", t.ring, className)}>
      <div className="min-w-0">
        <div className="truncate text-[11px] font-medium text-stone-500">{label}</div>
        <div className={cn("mt-0.5 text-[22px] leading-7 font-semibold tracking-tight", t.value)}>{value}</div>
        {hint ? <div className="mt-1 truncate text-[10px] text-stone-500">{hint}</div> : null}
      </div>
      <span
        className={cn("flex size-7 shrink-0 items-center justify-center rounded-md [&_svg]:size-3.5", t.chip, iconClassName)}
      >
        {icon}
      </span>
    </div>
  );
}

/**
 * Browser-chrome frame (reference hero): dark title bar with three dots, a URL pill and two workspace tabs,
 * wrapping an app surface. Decorative; the caption is read by screen readers.
 */
export function BrowserFrame({
  url,
  tabs,
  caption,
  className,
  children,
}: {
  url: string;
  tabs: readonly [string, string];
  caption: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <figure className={cn("relative m-0", className)}>
      <div
        aria-hidden="true"
        className="@container overflow-hidden rounded-2xl bg-white text-[13px] leading-tight text-stone-700 shadow-[0_2px_4px_rgb(28_25_23_/_0.04),0_32px_64px_-24px_rgb(11_43_42_/_0.35)] ring-1 ring-stone-900/10 [font-variant-numeric:tabular-nums]"
      >
        <div className="marketing-chrome flex items-center gap-3 px-3 py-2.5 @md:px-4">
          <span className="flex shrink-0 gap-1.5">
            <span className="size-2.5 rounded-full bg-red-400" />
            <span className="size-2.5 rounded-full bg-amber-400" />
            <span className="size-2.5 rounded-full bg-green-400" />
          </span>
          <span className="flex min-w-0 flex-1 items-center gap-2 rounded-md bg-white/10 px-2.5 py-1 font-mono text-[11px] text-teal-100/90">
            <span className="size-2.5 shrink-0 rounded-full border border-teal-200/50" />
            <span className="truncate">{url}</span>
          </span>
          <span className="hidden shrink-0 gap-1 @sm:flex">
            <span className="rounded-md bg-primary px-2 py-1 text-[10px] font-medium text-white">{tabs[0]}</span>
            <span className="rounded-md bg-white/10 px-2 py-1 text-[10px] font-medium text-teal-100/80">{tabs[1]}</span>
          </span>
        </div>
        {children}
      </div>
      <figcaption className="sr-only">{caption}</figcaption>
    </figure>
  );
}
