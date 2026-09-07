import Link from "next/link";
import { Activity } from "lucide-react";

import { cn } from "@/lib/utils";

import { EmptyState } from "./EmptyState";

/**
 * One activity row, already serialised and formatted by the page (Server Component):
 * `relative` = "2 h ago", `absolute` = "05 Sep 2026, 14:30" (tenant tz) for the tooltip.
 */
export type AuditListEntry = {
  id: string;
  /** Human-readable text, e.g. "Order SO-000123 status IN_PROGRESS → COMPLETED" (from describeAudit / summary). */
  summary: string;
  actorName: string | null;
  createdAtIso: string;
  relative: string;
  absolute?: string;
  /** Link to the entity, when it still exists. */
  href: string | null;
};

/** Activity feed / audit history list. */
export function AuditList({
  entries,
  emptyTitle = "No activity yet",
  className,
}: {
  entries: AuditListEntry[];
  emptyTitle?: string;
  className?: string;
}) {
  if (entries.length === 0) {
    return <EmptyState icon={Activity} title={emptyTitle} size="compact" className={className} />;
  }
  return (
    <ol className={cn("flex flex-col", className)}>
      {entries.map((entry, index) => (
        <li key={entry.id} className="relative flex gap-3 py-2.5">
          <span aria-hidden="true" className="flex w-4 shrink-0 flex-col items-center">
            <span className="mt-2 size-2 rounded-full bg-primary/60" />
            {index < entries.length - 1 ? <span className="mt-1 w-px flex-1 bg-border" /> : null}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm text-foreground">
              {entry.actorName ? <span className="font-medium">{entry.actorName} </span> : null}
              {entry.href ? (
                <Link
                  href={entry.href}
                  className="underline-offset-4 hover:underline focus-visible:rounded-sm focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                >
                  {entry.summary}
                </Link>
              ) : (
                <span>{entry.summary}</span>
              )}
            </p>
            <time
              dateTime={entry.createdAtIso}
              title={entry.absolute ?? entry.createdAtIso}
              className="text-xs text-muted-foreground"
            >
              {entry.relative}
            </time>
          </div>
        </li>
      ))}
    </ol>
  );
}
