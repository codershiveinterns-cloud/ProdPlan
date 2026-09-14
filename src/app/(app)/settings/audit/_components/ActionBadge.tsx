import type { AuditAction } from "@/generated/prisma/enums";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/** Colour semantics for audit actions, following the same outline-badge pattern as StatusBadge/PriorityBadge. */
const ACTION_META: Record<AuditAction, { label: string; className: string }> = {
  CREATE: { label: "Created", className: "border-green-200 bg-green-50 text-green-700" },
  UPDATE: { label: "Updated", className: "border-blue-200 bg-blue-50 text-blue-700" },
  DELETE: { label: "Deleted", className: "border-red-200 bg-red-50 text-red-700" },
  STATUS_CHANGE: { label: "Status change", className: "border-amber-200 bg-amber-50 text-amber-800" },
  IMPORT: { label: "Imported", className: "border-violet-200 bg-violet-50 text-violet-700" },
  LOGIN: { label: "Signed in", className: "border-slate-200 bg-slate-100 text-slate-700" },
};

export function ActionBadge({ action, className }: { action: AuditAction; className?: string }) {
  const meta = ACTION_META[action];
  return (
    <Badge variant="outline" className={cn(meta.className, className)}>
      {meta.label}
    </Badge>
  );
}
