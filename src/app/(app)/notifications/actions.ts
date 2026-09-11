"use server";

import { revalidatePath } from "next/cache";

import { ok, withAction } from "@/lib/action";
import { requirePermission } from "@/lib/auth/guards";
import { deleteNotification, getBellData, markAllRead, markRead, unreadCount } from "@/lib/notifications/service";
import type { BellData } from "@/lib/notifications/types";
import { idField } from "@/lib/validation/common";

/** Marks one own notification read (form field `id`). Returns the new unread count. */
export const markReadAction = withAction<{ count: number }>(async (formData) => {
  const { session, db } = await requirePermission("notifications:read");
  const id = idField("notification").parse(formData.get("id"));
  await markRead(db, session, id);
  revalidatePath("/notifications");
  return ok({ count: await unreadCount(db, session) });
});

/** Marks every own unread notification read. */
export const markAllReadAction = withAction<{ count: number }>(async () => {
  const { session, db } = await requirePermission("notifications:read");
  const affected = await markAllRead(db, session);
  revalidatePath("/notifications");
  return ok({ count: 0 }, affected === 0 ? "No unread notifications" : `Marked ${affected} as read`);
});

/** Removes one own notification (form field `id`). */
export const deleteNotificationAction = withAction<{ count: number }>(async (formData) => {
  const { session, db } = await requirePermission("notifications:read");
  const id = idField("notification").parse(formData.get("id"));
  await deleteNotification(db, session, id);
  revalidatePath("/notifications");
  return ok({ count: await unreadCount(db, session) }, "Notification dismissed");
});

/** Fresh unread count + latest items for the bell popover (called when it opens). */
export const loadBellAction = withAction<BellData>(async () => {
  const { session, db } = await requirePermission("notifications:read");
  return ok(await getBellData(db, session));
});
