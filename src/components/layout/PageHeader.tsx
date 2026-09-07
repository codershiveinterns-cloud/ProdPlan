import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

import { Breadcrumbs, type Crumb } from "./Breadcrumbs";

export type PageHeaderProps = {
  title: ReactNode;
  description?: ReactNode;
  /** Rendered above the title for depth >= 2 pages (Orders / SO-000123). */
  breadcrumbs?: Crumb[];
  /** Badges / status shown inline after the title (e.g. StatusBadge + PriorityBadge on order detail). */
  meta?: ReactNode;
  /** Primary and secondary actions (Buttons/Links). Wraps below the title on narrow screens. */
  actions?: ReactNode;
  className?: string;
};

/** Page title block: breadcrumbs, h1 (+ inline meta), description and right-aligned actions. */
export function PageHeader({ title, description, breadcrumbs, meta, actions, className }: PageHeaderProps) {
  return (
    <div className={cn("mb-6 flex flex-col gap-3", className)}>
      {breadcrumbs && breadcrumbs.length > 0 ? <Breadcrumbs items={breadcrumbs} /> : null}
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between md:gap-6">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">{title}</h1>
            {meta ? <div className="flex flex-wrap items-center gap-2">{meta}</div> : null}
          </div>
          {description ? <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{description}</p> : null}
        </div>
        {actions ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2 md:justify-end">{actions}</div>
        ) : null}
      </div>
    </div>
  );
}
