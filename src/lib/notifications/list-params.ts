/**
 * /notifications URL contract (docs/M2_SPEC.md §5): `page` (1-based, 25/page), `unread=1`, `type=<NotificationType>`.
 * Pure; reuses the shared list helpers.
 */
import type { NotificationType } from "@/generated/prisma/enums";
import { firstParam, listUrl, parseFlag, parsePage, type SearchParams } from "@/lib/machines/list-params";
import { isNotificationType } from "./types";

export type NotificationListParams = {
  page: number;
  unread: boolean;
  type: NotificationType | null;
};

export function parseNotificationListParams(sp: SearchParams): NotificationListParams {
  const type = firstParam(sp, "type");
  return {
    page: parsePage(sp),
    unread: parseFlag(sp, "unread"),
    type: isNotificationType(type) ? type : null,
  };
}

export function countActiveNotificationFilters(p: NotificationListParams): number {
  return (p.unread ? 1 : 0) + (p.type ? 1 : 0);
}

/** `/notifications?unread=1&type=ORDER_STATUS&page=2` (canonical: page 1 and empty filters are dropped). */
export function notificationListHref(params: NotificationListParams, patch: Partial<NotificationListParams> = {}): string {
  const p = { ...params, ...patch };
  return listUrl("/notifications", { unread: p.unread, type: p.type ?? "", page: p.page });
}
