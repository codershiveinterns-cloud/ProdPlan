"use client";

/**
 * One optimization suggestion card (docs/M3_SPEC.md §6): summary, rationale, projected improvement, Apply/Dismiss.
 * Same success/error handling pattern as `RunScheduleButton` (useActionState + a "handled" ref so the effect fires
 * once per result).
 */
import { useEffect, useRef } from "react";
import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowRight, Check, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { actionErrorMessage, type ActionState } from "@/components/forms/action-state";
import { SUGGESTION_KIND_LABELS } from "@/lib/optimization/types";
import type { SuggestionCardDTO } from "@/lib/optimization/generate";

import { applySuggestionAction, dismissSuggestionAction } from "../actions";

function humanMinutes(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  if (m < 60) return `${m} min`;
  const hours = Math.round(m / 60);
  return `${hours} h`;
}

export function SuggestionCard({ suggestion }: { suggestion: SuggestionCardDTO }) {
  const router = useRouter();
  const [applyState, applyAction] = useActionState(applySuggestionAction, null);
  const [dismissState, dismissAction] = useActionState(dismissSuggestionAction, null);
  const appliedHandled = useRef<ActionState>(null);
  const dismissedHandled = useRef<ActionState>(null);

  useEffect(() => {
    if (!applyState || appliedHandled.current === applyState) return;
    appliedHandled.current = applyState;
    if (applyState.ok) {
      toast.success(applyState.message ?? "Suggestion applied");
      router.refresh();
    } else {
      toast.error(actionErrorMessage(applyState.error));
    }
  }, [applyState, router]);

  useEffect(() => {
    if (!dismissState || dismissedHandled.current === dismissState) return;
    dismissedHandled.current = dismissState;
    if (dismissState.ok) {
      toast.success(dismissState.message ?? "Suggestion dismissed");
      router.refresh();
    } else {
      toast.error(actionErrorMessage(dismissState.error));
    }
  }, [dismissState, router]);

  const savedMinutes = Math.max(0, suggestion.currentLateMinutes - suggestion.projectedLateMinutes);
  const fewerConflicts = Math.max(0, suggestion.currentConflicts - suggestion.projectedConflicts);
  const improvementLabel = [
    `Saves ~${humanMinutes(savedMinutes)} lateness`,
    fewerConflicts > 0 ? `${fewerConflicts} fewer conflict${fewerConflicts === 1 ? "" : "s"}` : null,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <Card>
      <CardHeader>
        <Badge variant="outline" className="w-fit">
          {SUGGESTION_KIND_LABELS[suggestion.kind]}
        </Badge>
        <CardTitle className="mt-1">{suggestion.summary}</CardTitle>
        <CardDescription>{suggestion.rationale}</CardDescription>
      </CardHeader>
      <CardContent className="flex items-center gap-1.5 text-sm font-medium text-emerald-700">
        <ArrowRight className="size-4 shrink-0" aria-hidden="true" />
        {improvementLabel}
      </CardContent>
      <CardFooter className="flex flex-wrap gap-2 border-t-0 bg-transparent px-(--card-spacing)">
        <form action={applyAction}>
          <input type="hidden" name="suggestionId" value={suggestion.id} />
          <Button type="submit" className="min-h-11">
            <Check data-icon="inline-start" aria-hidden="true" />
            Apply
          </Button>
        </form>
        <form action={dismissAction}>
          <input type="hidden" name="suggestionId" value={suggestion.id} />
          <Button type="submit" variant="outline" className="min-h-11">
            <X data-icon="inline-start" aria-hidden="true" />
            Dismiss
          </Button>
        </form>
      </CardFooter>
    </Card>
  );
}
