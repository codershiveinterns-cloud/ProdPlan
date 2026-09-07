import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type PaginationProps = {
  /** 1-based current page. */
  page: number;
  pageSize: number;
  total: number;
  makeHref: (page: number) => string;
  className?: string;
};

/** Page numbers to show: first, last, current ±1, with `null` for gaps. */
export function pageWindow(page: number, totalPages: number): Array<number | null> {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, index) => index + 1);
  const pages = new Set<number>([1, totalPages, page - 1, page, page + 1]);
  const sorted = [...pages].filter((p) => p >= 1 && p <= totalPages).sort((a, b) => a - b);
  const out: Array<number | null> = [];
  for (let index = 0; index < sorted.length; index++) {
    const current = sorted[index]!;
    const previous = sorted[index - 1];
    if (previous !== undefined && current - previous > 1) out.push(null);
    out.push(current);
  }
  return out;
}

/** "Showing 26–50 of 312" + previous/next + page links. Pure links so it works as a Server Component. */
export function Pagination({ page, pageSize, total, makeHref, className }: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(Math.max(1, page), totalPages);
  const from = total === 0 ? 0 : (current - 1) * pageSize + 1;
  const to = Math.min(current * pageSize, total);
  const hasPrev = current > 1;
  const hasNext = current < totalPages;

  const navButton = buttonVariants({ variant: "outline", size: "icon" });
  const disabledButton = cn(navButton, "pointer-events-none opacity-50");

  return (
    <nav
      aria-label="Pagination"
      className={cn("flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between", className)}
    >
      <p className="text-sm text-muted-foreground">
        {total === 0 ? (
          "No results"
        ) : (
          <>
            Showing <span className="font-medium text-foreground">{from}–{to}</span> of{" "}
            <span className="font-medium text-foreground">{total.toLocaleString("en-IN")}</span>
          </>
        )}
      </p>
      {totalPages > 1 ? (
        <ul className="flex items-center gap-1">
          <li>
            {hasPrev ? (
              <Link href={makeHref(current - 1)} className={navButton} aria-label="Previous page" rel="prev">
                <ChevronLeft />
              </Link>
            ) : (
              <span className={disabledButton} aria-disabled="true" aria-label="Previous page">
                <ChevronLeft />
              </span>
            )}
          </li>
          {pageWindow(current, totalPages).map((p, index) =>
            p === null ? (
              <li key={`gap-${index}`} aria-hidden="true" className="px-1 text-sm text-muted-foreground">
                …
              </li>
            ) : (
              <li key={p} className={cn(p !== current && "hidden sm:block")}>
                <Link
                  href={makeHref(p)}
                  aria-current={p === current ? "page" : undefined}
                  aria-label={`Page ${p}`}
                  className={cn(
                    buttonVariants({ variant: p === current ? "secondary" : "ghost", size: "icon" }),
                    "tabular-nums",
                    p === current && "pointer-events-none font-semibold",
                  )}
                >
                  {p}
                </Link>
              </li>
            ),
          )}
          <li>
            {hasNext ? (
              <Link href={makeHref(current + 1)} className={navButton} aria-label="Next page" rel="next">
                <ChevronRight />
              </Link>
            ) : (
              <span className={disabledButton} aria-disabled="true" aria-label="Next page">
                <ChevronRight />
              </span>
            )}
          </li>
        </ul>
      ) : null}
    </nav>
  );
}
