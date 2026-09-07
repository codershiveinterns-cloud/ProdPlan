import { Fragment } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";

export type Crumb = { label: string; href?: string };

/** Breadcrumb trail for pages at depth >= 2 (e.g. Orders / SO-000123). The last item is the current page. */
export function Breadcrumbs({ items, className }: { items: Crumb[]; className?: string }) {
  if (items.length === 0) return null;
  return (
    <nav aria-label="Breadcrumb" className={cn("text-sm text-muted-foreground", className)}>
      <ol className="flex flex-wrap items-center gap-1.5">
        {items.map((item, index) => {
          const isLast = index === items.length - 1;
          return (
            <Fragment key={`${item.label}-${index}`}>
              <li className="flex min-w-0 items-center">
                {item.href && !isLast ? (
                  <Link
                    href={item.href}
                    className="inline-flex min-h-8 items-center truncate rounded-md px-1 -mx-1 outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
                  >
                    {item.label}
                  </Link>
                ) : (
                  <span
                    aria-current={isLast ? "page" : undefined}
                    className={cn("truncate", isLast && "font-medium text-foreground")}
                  >
                    {item.label}
                  </span>
                )}
              </li>
              {!isLast ? (
                <li aria-hidden="true" className="flex items-center">
                  <ChevronRight className="size-4 text-muted-foreground/70" />
                </li>
              ) : null}
            </Fragment>
          );
        })}
      </ol>
    </nav>
  );
}
