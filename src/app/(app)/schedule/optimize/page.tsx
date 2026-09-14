import type { Metadata } from "next";
import Link from "next/link";
import { RefreshCw, Sparkles } from "lucide-react";

import { EmptyState } from "@/components/data/EmptyState";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { requirePagePermission } from "@/lib/auth/guards";
import { generateAndPersistSuggestions } from "@/lib/optimization/generate";

import { SuggestionCard } from "./_components/SuggestionCard";

export const metadata: Metadata = { title: "Optimization suggestions" };

/**
 * docs/M3_SPEC.md §3, §6: suggestions are (re)generated on every page load — the previous `PENDING` batch is
 * marked `STALE` and a fresh one persisted, unless the per-tenant rate limit was hit (§3: once per 20 s), in which
 * case the current batch is shown unchanged. `schedule:run` gates the whole page: viewing, applying and
 * dismissing all change or reflect the live schedule, so this is an operational tool, not the read-only
 * `analytics:read` dashboard.
 */
export default async function OptimizePage() {
  const { session, db } = await requirePagePermission("schedule:run");
  const { suggestions, rateLimited } = await generateAndPersistSuggestions(db, session);

  return (
    <>
      <PageHeader
        title="Optimization suggestions"
        description="Deterministic, explainable changes to the current schedule — reassigning a step to a less-loaded machine or raising a delayed order's priority — that reduce lateness or conflicts without breaking another order."
        breadcrumbs={[{ label: "Schedule", href: "/schedule" }, { label: "Suggestions" }]}
        actions={
          <Button asChild variant="outline">
            <Link href="/schedule/optimize">
              <RefreshCw data-icon="inline-start" aria-hidden="true" />
              Regenerate
            </Link>
          </Button>
        }
      />

      {rateLimited ? (
        <p className="mb-4 text-sm text-muted-foreground">
          Showing the suggestions generated a moment ago — regeneration is limited to once every 20 seconds.
        </p>
      ) : null}

      {suggestions.length === 0 ? (
        <div className="rounded-lg border">
          <EmptyState icon={Sparkles} title="No improving changes found right now." />
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {suggestions.map((s) => (
            <SuggestionCard key={s.id} suggestion={s} />
          ))}
        </div>
      )}
    </>
  );
}
