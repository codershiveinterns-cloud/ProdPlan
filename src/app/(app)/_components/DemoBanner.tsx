import Link from "next/link";
import { ArrowRight, FlaskConical } from "lucide-react";

/**
 * Slim amber banner shown above every page of the shared demo plant (docs/M1_SPEC.md §6.9). Rendered by
 * src/app/(app)/layout.tsx when `session.tenant.slug === "demo"`.
 */
export function DemoBanner() {
  return (
    <div
      role="status"
      data-slot="demo-banner"
      className="mb-5 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900"
    >
      <FlaskConical className="size-4 shrink-0 text-brand-accent-ink" aria-hidden="true" />
      <p className="min-w-0 flex-1">
        <span className="font-medium">Demo plant</span>
        <span className="text-amber-900/80"> — shared sample data, refreshed daily.</span>
      </p>
      <Link
        href="/signup"
        className="inline-flex items-center gap-1 rounded-md font-medium text-brand-accent-ink underline-offset-4 hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        Create your own workspace
        <ArrowRight className="size-3.5" aria-hidden="true" />
      </Link>
    </div>
  );
}
