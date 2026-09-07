import type { StockMovementType } from "@/generated/prisma/enums";
import { Badge } from "@/components/ui/badge";
import { MOVEMENT_TYPE_META } from "@/lib/materials/movement-types";
import { cn } from "@/lib/utils";

/** Ledger type badge: RECEIPT green · ISSUE red · RETURN blue · ADJUSTMENT amber. */
export function MovementTypeBadge({ type, className }: { type: StockMovementType; className?: string }) {
  const meta = MOVEMENT_TYPE_META[type];
  return (
    <Badge variant="outline" className={cn(meta.className, className)}>
      {meta.label}
    </Badge>
  );
}
