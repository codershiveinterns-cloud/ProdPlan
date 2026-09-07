import type { ReactNode } from "react";
import Link from "next/link";
import { Check } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { SetupStep } from "@/lib/dashboard/queries";
import { cn } from "@/lib/utils";

export type SetupChecklistItem = SetupStep & {
  /** Primary button for the step. */
  action: { href: string; label: string };
  /** Optional second button (Orders: "Import CSV"). */
  secondary?: { href: string; label: string };
};

/** First-run "Set up your plant" card (spec §6.6); rendered above the tiles while the plant has 0 orders. */
export function SetupChecklist({ items, extra }: { items: SetupChecklistItem[]; extra?: ReactNode }) {
  const done = items.filter((i) => i.done).length;
  return (
    <section aria-labelledby="setup-heading" className="overflow-hidden rounded-xl bg-card ring-1 ring-primary/30">
      <div className="flex flex-col gap-3 border-b bg-primary/5 px-4 py-4 md:flex-row md:items-center md:justify-between md:px-6">
        <div>
          <h2 id="setup-heading" className="text-lg font-semibold text-foreground">
            Set up your plant
          </h2>
          <p className="text-sm text-muted-foreground">
            {done} of {items.length} steps done. Work through master data first; the dashboard fills in as you go.
          </p>
        </div>
        {extra ? <div className="flex shrink-0 flex-wrap items-center gap-2">{extra}</div> : null}
      </div>
      <ol className="divide-y">
        {items.map((item, index) => (
          <li key={item.key} className="flex flex-col gap-3 px-4 py-3 md:flex-row md:items-center md:gap-4 md:px-6">
            <span
              className={cn(
                "flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold",
                item.done ? "bg-green-100 text-green-700" : "bg-muted text-muted-foreground",
              )}
              aria-hidden="true"
            >
              {item.done ? <Check className="size-4" /> : index + 1}
            </span>
            <div className="min-w-0 flex-1">
              <p className={cn("text-sm font-medium", item.done ? "text-muted-foreground line-through decoration-muted-foreground/50" : "text-foreground")}>
                <span className="sr-only">{item.done ? "Done: " : "To do: "}</span>
                {item.title}
              </p>
              <p className="text-sm text-muted-foreground">{item.description}</p>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <Button variant={item.done ? "outline" : "default"} asChild>
                <Link href={item.action.href}>{item.action.label}</Link>
              </Button>
              {item.secondary ? (
                <Button variant="outline" asChild>
                  <Link href={item.secondary.href}>{item.secondary.label}</Link>
                </Button>
              ) : null}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
