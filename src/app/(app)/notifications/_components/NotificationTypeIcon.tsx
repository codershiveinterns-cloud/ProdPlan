import type { LucideIcon } from "lucide-react";
import { Boxes, CalendarRange, ClipboardList, Clock, TriangleAlert, Wrench } from "lucide-react";

import type { NotificationType } from "@/generated/prisma/enums";
import { cn } from "@/lib/utils";

/**
 * One icon + tone per notification type (colour semantics per docs/M1_SPEC.md §5: conflicts/shortages amber,
 * delivery risk red, order status blue, schedule runs primary, floor operations slate). Text labels always
 * accompany the icon, so colour is never the only signal.
 */
export const NOTIFICATION_TYPE_META: Record<NotificationType, { icon: LucideIcon; tone: string }> = {
  SCHEDULE_RUN: { icon: CalendarRange, tone: "bg-primary/10 text-primary" },
  SCHEDULE_CONFLICT: { icon: TriangleAlert, tone: "bg-amber-50 text-amber-700" },
  MATERIAL_SHORTAGE: { icon: Boxes, tone: "bg-amber-50 text-amber-700" },
  DELIVERY_RISK: { icon: Clock, tone: "bg-red-50 text-red-700" },
  ORDER_STATUS: { icon: ClipboardList, tone: "bg-blue-50 text-blue-700" },
  OPERATION_STATUS: { icon: Wrench, tone: "bg-slate-100 text-slate-700" },
};

export function NotificationTypeIcon({ type, className }: { type: NotificationType; className?: string }) {
  const meta = NOTIFICATION_TYPE_META[type];
  const Icon = meta.icon;
  return (
    <span
      aria-hidden="true"
      className={cn("flex size-9 shrink-0 items-center justify-center rounded-full", meta.tone, className)}
    >
      <Icon className="size-4" />
    </span>
  );
}
