import { Badge } from "@/components/ui/badge";
import { REORDER_LABELS, type ReorderState } from "@/lib/materials/dto";
import { cn } from "@/lib/utils";

/** "Below reorder" / "At reorder" amber badge (docs/M1_SPEC.md §5 colour semantics). Renders nothing when null. */
export function ReorderBadge({ state, className }: { state: ReorderState; className?: string }) {
  if (!state) return null;
  return (
    <Badge variant="outline" className={cn("border-amber-200 bg-amber-50 text-amber-800", className)}>
      {REORDER_LABELS[state]}
    </Badge>
  );
}

/** Row tint for materials at/below their reorder threshold (used with DataTable `rowClassName`). */
export const REORDER_ROW_CLASS = "bg-amber-50 hover:bg-amber-100/60";
