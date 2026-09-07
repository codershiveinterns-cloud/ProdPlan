import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { cn } from "@/lib/utils";

export type DashboardSectionProps = {
  title: string;
  description?: ReactNode;
  /** "View all" link target and label (e.g. "View all 24"). */
  viewAll?: { href: string; label: string };
  /** Extra header controls (badges, counts). */
  meta?: ReactNode;
  children: ReactNode;
  className?: string;
  /** Remove the inner padding (tables bring their own frame). */
  flush?: boolean;
};

/** A titled panel on the dashboard: header row with an optional "View all" link, then content. */
export function DashboardSection({ title, description, viewAll, meta, children, className, flush = false }: DashboardSectionProps) {
  return (
    <section className={cn("flex flex-col gap-3", className)} aria-labelledby={`${slug(title)}-heading`}>
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
        <div className="min-w-0">
          <h2 id={`${slug(title)}-heading`} className="flex items-center gap-2 text-base font-semibold text-foreground">
            {title}
            {meta}
          </h2>
          {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
        </div>
        {viewAll ? (
          <Link
            href={viewAll.href}
            className="inline-flex h-11 items-center gap-1 rounded-lg px-2 text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            {viewAll.label}
            <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        ) : null}
      </div>
      {flush ? children : <div className="rounded-xl bg-card p-4 ring-1 ring-foreground/10">{children}</div>}
    </section>
  );
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}
