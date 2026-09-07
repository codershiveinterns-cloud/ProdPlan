import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Inbox } from "lucide-react";

import { cn } from "@/lib/utils";

export type EmptyStateProps = {
  icon?: LucideIcon;
  title: string;
  description?: ReactNode;
  /** Primary CTA (and optionally a secondary one, e.g. "Import CSV"). */
  action?: ReactNode;
  /** `compact` for cards/sections inside a detail page. */
  size?: "default" | "compact";
  className?: string;
};

/** Empty list / section placeholder: icon, title, one line, CTA (spec §5 "Empty states"). */
export function EmptyState({ icon: Icon = Inbox, title, description, action, size = "default", className }: EmptyStateProps) {
  const compact = size === "compact";
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center",
        compact ? "gap-2 px-4 py-8" : "gap-3 px-6 py-14",
        className,
      )}
    >
      <div
        className={cn(
          "flex items-center justify-center rounded-full bg-muted text-muted-foreground",
          compact ? "size-10" : "size-14",
        )}
      >
        <Icon className={compact ? "size-5" : "size-7"} aria-hidden="true" />
      </div>
      <h3 className={cn("font-semibold text-foreground", compact ? "text-sm" : "text-base")}>{title}</h3>
      {description ? <p className="max-w-md text-sm text-muted-foreground">{description}</p> : null}
      {action ? <div className="mt-2 flex flex-wrap items-center justify-center gap-2">{action}</div> : null}
    </div>
  );
}
