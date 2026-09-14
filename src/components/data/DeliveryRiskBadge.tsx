import { AlertTriangle, ArrowUpRight, Boxes, Minus } from "lucide-react";

import type { DeliveryRisk, RiskCause } from "@/generated/prisma/enums";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/** Colour semantics from docs/M2_SPEC.md §3: ON_TRACK green outline, AT_RISK amber, DELAYED red, LATE red filled. */
export const DELIVERY_RISK_META: Record<DeliveryRisk, { label: string; className: string }> = {
  ON_TRACK: { label: "On track", className: "border-green-200 bg-green-50 text-green-700" },
  AT_RISK: { label: "At risk", className: "border-amber-200 bg-amber-50 text-amber-800" },
  DELAYED: { label: "Delayed", className: "border-red-200 bg-red-50 text-red-700" },
  LATE: { label: "Late", className: "border-red-600 bg-red-600 text-white" },
};

export const DELIVERY_RISKS = Object.keys(DELIVERY_RISK_META) as DeliveryRisk[];

export function deliveryRiskLabel(risk: DeliveryRisk): string {
  return DELIVERY_RISK_META[risk].label;
}

/**
 * Cause labels/icons for `Order.riskCause` (docs/M3_SPEC.md §2). `RISK_CAUSE_LABELS` is meant to be exported from
 * `src/lib/scheduling/risk.ts` by Engineer A (that file also owns `classifyRisk()`'s cause computation); it did
 * not exist there yet when this file was written, so the mapping is defined locally here, matching spec §2
 * verbatim. INTEGRATION NOTE: once `src/lib/scheduling/risk.ts` exports `RISK_CAUSE_LABELS`, delete the local
 * copy below and import it from there instead, to avoid two sources of truth.
 */
export const RISK_CAUSE_LABELS: Record<RiskCause, string> = {
  NONE: "—",
  MATERIAL: "Material shortage",
  CAPACITY: "Machine capacity",
  UPSTREAM_DELAY: "Upstream delay",
};

const RISK_CAUSE_ICON: Record<RiskCause, typeof Minus> = {
  NONE: Minus,
  MATERIAL: Boxes,
  CAPACITY: AlertTriangle,
  UPSTREAM_DELAY: ArrowUpRight,
};

export function DeliveryRiskBadge({ risk, cause, className }: { risk: DeliveryRisk; cause?: RiskCause; className?: string }) {
  const meta = DELIVERY_RISK_META[risk];
  return (
    <span className="inline-flex items-center gap-1.5">
      <Badge variant="outline" className={cn(meta.className, className)}>
        {meta.label}
      </Badge>
      {cause && cause !== "NONE" ? <RiskCauseIndicator cause={cause} /> : null}
    </span>
  );
}

/** Small icon + label next to a risk badge, e.g. "· Material shortage" (docs/M3_SPEC.md §6). */
export function RiskCauseIndicator({ cause, className }: { cause: RiskCause; className?: string }) {
  if (cause === "NONE") return null;
  const Icon = RISK_CAUSE_ICON[cause];
  return (
    <span className={cn("inline-flex items-center gap-1 text-xs text-muted-foreground", className)}>
      <Icon className="size-3.5" aria-hidden="true" />
      {RISK_CAUSE_LABELS[cause]}
    </span>
  );
}
