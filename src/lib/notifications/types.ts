/**
 * Notification types shared by the server (service, actions, page) and the client (bell, list rows).
 * Pure: no Prisma runtime, no `next/*` imports — safe for client bundles.
 */
import type { NotificationType } from "@/generated/prisma/enums";

export const NOTIFICATION_TYPES = [
  "SCHEDULE_RUN",
  "SCHEDULE_CONFLICT",
  "MATERIAL_SHORTAGE",
  "DELIVERY_RISK",
  "ORDER_STATUS",
  "OPERATION_STATUS",
] as const satisfies readonly NotificationType[];

export const NOTIFICATION_TYPE_LABELS: Record<NotificationType, string> = {
  SCHEDULE_RUN: "Schedule",
  SCHEDULE_CONFLICT: "Conflict",
  MATERIAL_SHORTAGE: "Material shortage",
  DELIVERY_RISK: "Delivery risk",
  ORDER_STATUS: "Order status",
  OPERATION_STATUS: "Operation",
};

export function isNotificationType(v: unknown): v is NotificationType {
  return typeof v === "string" && (NOTIFICATION_TYPES as readonly string[]).includes(v);
}

/** A notification row prepared for the UI: dates as ISO strings, relative/absolute labels formatted server-side. */
export type NotificationItem = {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  href: string | null;
  entityType: string | null;
  entityId: string | null;
  read: boolean;
  createdAt: string;
  /** "5 min ago" — formatted on the server at fetch time (docs/M1_SPEC.md §5 "Dates in UI"). */
  relative: string;
  /** "05 Sep 2026, 14:30" in the tenant timezone, for `title=`. */
  absolute: string;
};

/** What the Topbar bell receives on first render and from `loadBellAction`. */
export type BellData = {
  count: number;
  items: NotificationItem[];
};

/** Number of rows shown in the bell popover. */
export const BELL_ITEMS = 8;
/** Rows per page on /notifications. */
export const NOTIFICATIONS_PAGE_SIZE = 25;
/** Unread-count polling interval of the bell. */
export const BELL_POLL_MS = 60_000;

/**
 * `window` event dispatched by client code after it changed notifications (mark read / dismiss), so the Topbar bell
 * refreshes its count immediately instead of waiting for the next poll.
 */
export const NOTIFICATIONS_CHANGED_EVENT = "prodplan:notifications-changed";
