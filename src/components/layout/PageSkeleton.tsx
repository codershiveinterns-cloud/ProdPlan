import { Skeleton } from "@/components/ui/skeleton";

/** Loading placeholder shaped like a list page: header, toolbar and a table with `rows` 48 px rows. */
export function PageSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div aria-busy="true" aria-live="polite" className="flex flex-col gap-6">
      <span className="sr-only">Loading…</span>
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-8 w-56" />
        </div>
        <Skeleton className="h-11 w-32" />
      </div>
      <div className="flex flex-wrap gap-3">
        <Skeleton className="h-11 w-full max-w-xs" />
        <Skeleton className="hidden h-11 w-40 md:block" />
        <Skeleton className="hidden h-11 w-40 md:block" />
      </div>
      <div className="overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10">
        <div className="h-12 border-b bg-muted" />
        <ul className="divide-y">
          {Array.from({ length: rows }).map((_, index) => (
            <li key={index} className="flex h-12 items-center gap-6 px-3">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-40" />
              <Skeleton className="hidden h-4 w-32 md:block" />
              <Skeleton className="hidden h-4 w-20 lg:block" />
              <Skeleton className="ml-auto h-5 w-20 rounded-full" />
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
