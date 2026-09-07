import Link from "next/link";
import { Factory } from "lucide-react";

import { cn } from "@/lib/utils";

/** Product mark used at the top of the sidebar and the mobile navigation sheet. */
export function Brand({ tenantName, className }: { tenantName?: string; className?: string }) {
  return (
    <Link
      href="/dashboard"
      className={cn(
        "flex h-14 items-center gap-3 px-4 outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
        className,
      )}
    >
      <span
        aria-hidden="true"
        className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-xs"
      >
        <Factory className="size-5" />
      </span>
      <span className="flex min-w-0 flex-col leading-tight">
        <span className="text-sm font-semibold tracking-tight text-foreground">ProdPlan</span>
        {tenantName ? (
          <span className="truncate text-xs text-muted-foreground">{tenantName}</span>
        ) : null}
      </span>
    </Link>
  );
}
