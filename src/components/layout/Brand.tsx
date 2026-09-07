import Link from "next/link";

import { cn } from "@/lib/utils";

import { BrandMark } from "./BrandMark";

/** Product mark used at the top of the sidebar and the mobile navigation sheet. */
export function Brand({ tenantName, className }: { tenantName?: string; className?: string }) {
  return (
    <Link
      href="/dashboard"
      className={cn(
        "flex h-14 items-center gap-3 px-4 outline-none focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset",
        className,
      )}
    >
      <BrandMark size={36} className="rounded-lg shadow-xs" />
      <span className="flex min-w-0 flex-col leading-tight">
        <span className="font-heading text-[15px] font-bold tracking-tight text-foreground">ProdPlan</span>
        {tenantName ? (
          <span className="truncate text-xs text-muted-foreground">{tenantName}</span>
        ) : null}
      </span>
    </Link>
  );
}
