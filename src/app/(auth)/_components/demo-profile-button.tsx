"use client";

import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { LoaderCircle } from "lucide-react";
import { cn } from "@/lib/utils";

/** One demo-profile card: a 44 px+ submit button that shows its pending state while the demo action runs. */
export function DemoProfileButton({
  title,
  description,
  icon,
  className,
}: {
  title: string;
  description: string;
  icon: ReactNode;
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending || undefined}
      aria-label={`Open the demo plant as ${title}`}
      className={cn(
        "group flex min-h-11 w-full items-center gap-3 rounded-lg border border-input bg-card px-3 py-2 text-left shadow-xs transition-all outline-none",
        "hover:border-primary/40 hover:bg-primary-soft focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
        "active:translate-y-px disabled:pointer-events-none disabled:opacity-60",
        className,
      )}
    >
      <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-md bg-primary-soft text-primary-soft-foreground [&_svg]:size-4">
        {pending ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : icon}
      </span>
      <span className="flex min-w-0 flex-col leading-tight">
        <span className="text-sm font-semibold text-foreground">{pending ? "Opening…" : title}</span>
        <span className="text-xs text-muted-foreground">{description}</span>
      </span>
    </button>
  );
}
