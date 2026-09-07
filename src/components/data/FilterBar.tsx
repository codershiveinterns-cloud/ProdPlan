"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { SlidersHorizontal } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

export type FilterBarProps = {
  /** Plain form controls with `name` attributes (native selects/inputs, shadcn Select, DateInput, Checkbox…). */
  children: ReactNode;
  /** Number of active module filters; shown as a badge on the mobile trigger and enables the Clear link. */
  activeCount?: number;
  /** Where "Clear" goes; defaults to the current path (drops every parameter). */
  clearHref?: string;
  /** Query keys copied into hidden inputs so submitting the filters keeps search and sort. `page` is always reset. */
  preserve?: string[];
  applyLabel?: string;
  className?: string;
};

/**
 * Toolbar for list filters (spec §5 "List URL contract"). Inline row on md+, a "Filters (n)" Sheet below md.
 * Both render the same children inside a GET form that submits to the current path, so filters are plain URL
 * state and need no client handlers of their own.
 */
export function FilterBar({
  children,
  activeCount = 0,
  clearHref,
  preserve = ["q", "sort", "dir"],
  applyLabel = "Apply",
  className,
}: FilterBarProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);

  const preserved = preserve
    .map((key) => [key, searchParams.get(key)] as const)
    .filter(([, value]) => value !== null && value !== "");

  const hiddenInputs = preserved.map(([key, value]) => (
    <input key={key} type="hidden" name={key} value={value ?? ""} />
  ));

  const clearTarget = clearHref ?? pathname;

  return (
    <div className={cn("flex items-center gap-2", className)}>
      {/* Inline toolbar (md and up) */}
      <form
        method="get"
        action={pathname}
        className="hidden flex-wrap items-end gap-3 md:flex md:[&_[data-slot=field]]:w-auto md:[&_[data-slot=field]]:min-w-36"
        aria-label="Filters"
      >
        {hiddenInputs}
        {children}
        <Button type="submit" variant="outline">
          {applyLabel}
        </Button>
        {activeCount > 0 ? (
          <Button variant="link" asChild className="px-1">
            <Link href={clearTarget}>Clear</Link>
          </Button>
        ) : null}
      </form>

      {/* Sheet (below md) */}
      <div className="flex items-center gap-2 md:hidden">
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <Button variant="outline">
              <SlidersHorizontal />
              Filters
              {activeCount > 0 ? (
                <Badge className="ml-1 h-5 min-w-5 px-1.5" aria-label={`${activeCount} active`}>
                  {activeCount}
                </Badge>
              ) : null}
            </Button>
          </SheetTrigger>
          <SheetContent side="bottom" className="max-h-[85dvh] gap-0 overflow-y-auto rounded-t-xl p-0">
            <form method="get" action={pathname} className="flex flex-col" onSubmit={() => setOpen(false)}>
              <SheetHeader className="border-b">
                <SheetTitle>Filters</SheetTitle>
                <SheetDescription>Narrow the list, then apply.</SheetDescription>
              </SheetHeader>
              <div className="flex flex-col gap-4 p-4 [&_[data-slot=field]]:w-full">
                {hiddenInputs}
                {children}
              </div>
              <SheetFooter className="border-t">
                <Button type="submit">{applyLabel}</Button>
                {activeCount > 0 ? (
                  <Button variant="outline" asChild>
                    <Link href={clearTarget} onClick={() => setOpen(false)}>
                      Clear filters
                    </Link>
                  </Button>
                ) : null}
              </SheetFooter>
            </form>
          </SheetContent>
        </Sheet>
        {activeCount > 0 ? (
          <Button variant="link" asChild className="px-1">
            <Link href={clearTarget}>Clear</Link>
          </Button>
        ) : null}
      </div>
    </div>
  );
}
