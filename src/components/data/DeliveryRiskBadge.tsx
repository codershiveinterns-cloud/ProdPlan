import type { DeliveryRisk } from "@/generated/prisma/enums";
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

export function DeliveryRiskBadge({ risk, className }: { risk: DeliveryRisk; className?: string }) {
  const meta = DELIVERY_RISK_META[risk];
  return (
    <Badge variant="outline" className={cn(meta.className, className)}>
      {meta.label}
    </Badge>
  );
}
