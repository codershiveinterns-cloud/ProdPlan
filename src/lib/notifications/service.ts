/**
 * In-app notifications — docs/M2_SPEC.md §5.
 *
 *   await notify(tx, scheduleRunFinished({ tenantId, actorUserId, orderCount: 18, conflictCount: 3 }));
 *
 * `notify(tx, input)` fans out ONE row per recipient (active users of the tenant matching `recipients.roles`
 * and/or `recipients.userIds`, minus `excludeUserId` — the actor never gets a notification for their own action).
 * When `dedupeKey` is set and the recipient already has an UNREAD row with that key created within the last 24 h,
 * that row is bumped (createdAt = now, title/body/href refreshed) instead of a duplicate being inserted.
 *
 * Reads (`listNotifications`, `unreadCount`, `getBellData`) and per-row writes (`markRead`, `markAllRead`,
 * `deleteNotification`) are always confined to the caller's own rows: scoped client + `userId = session.user.id`.
 *
 * Server-only (imports the scoped client types); the client-safe pieces live in ./types.ts.
 */
import type { NotificationType, Role } from "@/generated/prisma/enums";
import type { Session } from "@/lib/auth/session";
import type { TenantDb, TenantTx } from "@/lib/db";
import { formatDateTime, formatRelative } from "@/lib/format";
import { BELL_ITEMS, NOTIFICATIONS_PAGE_SIZE, type BellData, type NotificationItem } from "./types";

export type { BellData, NotificationItem } from "./types";

// ---------------------------------------------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------------------------------------------

export type NotificationRecipients = {
  /** Every active user of the tenant with one of these roles. */
  roles?: readonly Role[];
  /** Specific users (must be active members of the tenant; others are ignored). */
  userIds?: readonly string[];
};

export type NotificationInput = {
  tenantId: string;
  recipients: NotificationRecipients;
  type: NotificationType;
  title: string;
  body: string;
  href?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  /** Collapses unread repeats within DEDUPE_WINDOW_MS per recipient (see the file header). */
  dedupeKey?: string | null;
  /** The acting user — never notified about their own action. */
  excludeUserId?: string | null;
};

export type NotifyResult = {
  /** Rows inserted. */
  created: number;
  /** Existing unread rows whose createdAt was bumped instead of inserting a duplicate. */
  bumped: number;
  /** Recipient user ids after role/userId resolution and exclusion. */
  recipientIds: string[];
};

/** A notification-owner session: the full `Session` satisfies it; tests may pass `{ user: { id } }`. */
export type NotificationSession = { user: { id: string } };

/** Dedupe window (docs/M2_SPEC.md §5: "within 24 h"). */
export const DEDUPE_WINDOW_MS = 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------------------------------------------
// Pure helpers (unit-tested without a database)
// ---------------------------------------------------------------------------------------------------------------

export type RecipientCandidate = { id: string; role: Role; isActive: boolean };

/**
 * Resolves the recipient user ids from the tenant's users: active users whose role is in `recipients.roles` OR whose
 * id is in `recipients.userIds`, minus `excludeUserId`. Order is preserved; ids are unique.
 */
export function resolveRecipientIds(
  users: readonly RecipientCandidate[],
  recipients: NotificationRecipients,
  excludeUserId?: string | null,
): string[] {
  const roles = new Set<Role>(recipients.roles ?? []);
  const ids = new Set<string>(recipients.userIds ?? []);
  const out: string[] = [];
  const seen = new Set<string>();
  for (const u of users) {
    if (!u.isActive) continue;
    if (excludeUserId && u.id === excludeUserId) continue;
    if (!roles.has(u.role) && !ids.has(u.id)) continue;
    if (seen.has(u.id)) continue;
    seen.add(u.id);
    out.push(u.id);
  }
  return out;
}

/** The oldest createdAt an unread row may have to still count as a duplicate. */
export function dedupeThreshold(now: Date | number = Date.now()): Date {
  const ms = now instanceof Date ? now.getTime() : now;
  return new Date(ms - DEDUPE_WINDOW_MS);
}

/**
 * Splits recipients into those with an existing (unread, in-window) row to bump and those that need a new row.
 * `existing` is the result of the dedupe lookup: one entry per matching row.
 */
export function partitionByDedupe(
  recipientIds: readonly string[],
  existing: readonly { id: string; userId: string }[],
): { bumpRowIds: string[]; createUserIds: string[] } {
  const byUser = new Map<string, string[]>();
  for (const row of existing) {
    const list = byUser.get(row.userId);
    if (list) list.push(row.id);
    else byUser.set(row.userId, [row.id]);
  }
  const bumpRowIds: string[] = [];
  const createUserIds: string[] = [];
  for (const userId of recipientIds) {
    const rows = byUser.get(userId);
    if (rows && rows.length > 0) bumpRowIds.push(...rows);
    else createUserIds.push(userId);
  }
  return { bumpRowIds, createUserIds };
}

// ---------------------------------------------------------------------------------------------------------------
// notify
// ---------------------------------------------------------------------------------------------------------------

/**
 * Fans out `input` to its recipients through the SAME scoped client/transaction as the mutation it describes.
 * Never throws for "no recipients" — it simply returns zeros, so callers need no guards.
 */
export async function notify(tx: TenantTx | TenantDb, input: NotificationInput): Promise<NotifyResult> {
  const roles = input.recipients.roles ?? [];
  const userIds = input.recipients.userIds ?? [];
  if (roles.length === 0 && userIds.length === 0) return { created: 0, bumped: 0, recipientIds: [] };

  const or: Array<{ role: { in: Role[] } } | { id: { in: string[] } }> = [];
  if (roles.length > 0) or.push({ role: { in: [...roles] } });
  if (userIds.length > 0) or.push({ id: { in: [...userIds] } });

  // Only ids/roles are read here (a strict subset of userSelect — no credentials can leak).
  const users = await tx.user.findMany({
    where: { isActive: true, OR: or },
    select: { id: true, role: true, isActive: true },
    orderBy: { createdAt: "asc" },
  });
  const recipientIds = resolveRecipientIds(users, input.recipients, input.excludeUserId);
  if (recipientIds.length === 0) return { created: 0, bumped: 0, recipientIds };

  const now = new Date();
  let bumpRowIds: string[] = [];
  let createUserIds = recipientIds;

  if (input.dedupeKey) {
    const existing = await tx.notification.findMany({
      where: {
        dedupeKey: input.dedupeKey,
        userId: { in: recipientIds },
        readAt: null,
        createdAt: { gte: dedupeThreshold(now) },
      },
      select: { id: true, userId: true },
    });
    ({ bumpRowIds, createUserIds } = partitionByDedupe(recipientIds, existing));
  }

  let bumped = 0;
  if (bumpRowIds.length > 0) {
    const result = await tx.notification.updateMany({
      where: { id: { in: bumpRowIds } },
      data: {
        createdAt: now,
        title: input.title,
        body: input.body,
        href: input.href ?? null,
        entityType: input.entityType ?? null,
        entityId: input.entityId ?? null,
      },
    });
    bumped = result.count;
  }

  let created = 0;
  if (createUserIds.length > 0) {
    const result = await tx.notification.createMany({
      data: createUserIds.map((userId) => ({
        tenantId: input.tenantId,
        userId,
        type: input.type,
        title: input.title,
        body: input.body,
        href: input.href ?? null,
        entityType: input.entityType ?? null,
        entityId: input.entityId ?? null,
        dedupeKey: input.dedupeKey ?? null,
        createdAt: now,
      })),
    });
    created = result.count;
  }

  return { created, bumped, recipientIds };
}

// ---------------------------------------------------------------------------------------------------------------
// Own-row reads and writes
// ---------------------------------------------------------------------------------------------------------------

/** Marks one of the caller's notifications read. Returns false when it is not theirs / does not exist / was read. */
export async function markRead(db: TenantDb | TenantTx, session: NotificationSession, id: string): Promise<boolean> {
  const result = await db.notification.updateMany({
    where: { id, userId: session.user.id, readAt: null },
    data: { readAt: new Date() },
  });
  return result.count > 0;
}

/** Marks every unread notification of the caller read; returns how many were affected. */
export async function markAllRead(db: TenantDb | TenantTx, session: NotificationSession): Promise<number> {
  const result = await db.notification.updateMany({
    where: { userId: session.user.id, readAt: null },
    data: { readAt: new Date() },
  });
  return result.count;
}

export async function unreadCount(db: TenantDb | TenantTx, session: NotificationSession): Promise<number> {
  return db.notification.count({ where: { userId: session.user.id, readAt: null } });
}

/** Deletes one of the caller's notifications. Returns false when it is not theirs / does not exist. */
export async function deleteNotification(db: TenantDb | TenantTx, session: NotificationSession, id: string): Promise<boolean> {
  const result = await db.notification.deleteMany({ where: { id, userId: session.user.id } });
  return result.count > 0;
}

export type ListNotificationsParams = {
  /** 1-based. */
  page: number;
  unreadOnly?: boolean;
  type?: NotificationType | null;
};

export type NotificationRow = {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  href: string | null;
  entityType: string | null;
  entityId: string | null;
  readAt: Date | null;
  createdAt: Date;
};

const rowSelect = {
  id: true,
  type: true,
  title: true,
  body: true,
  href: true,
  entityType: true,
  entityId: true,
  readAt: true,
  createdAt: true,
} as const;

/** The caller's notifications, newest first, 25 per page. */
export async function listNotifications(
  db: TenantDb | TenantTx,
  session: NotificationSession,
  params: ListNotificationsParams,
): Promise<{ rows: NotificationRow[]; total: number; page: number; pageSize: number }> {
  const page = Number.isInteger(params.page) && params.page >= 1 ? params.page : 1;
  const where = {
    userId: session.user.id,
    ...(params.unreadOnly ? { readAt: null } : {}),
    ...(params.type ? { type: params.type } : {}),
  };
  const [rows, total] = await Promise.all([
    db.notification.findMany({
      where,
      select: rowSelect,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * NOTIFICATIONS_PAGE_SIZE,
      take: NOTIFICATIONS_PAGE_SIZE,
    }),
    db.notification.count({ where }),
  ]);
  return { rows, total, page, pageSize: NOTIFICATIONS_PAGE_SIZE };
}

// ---------------------------------------------------------------------------------------------------------------
// Presentation helpers (Server Components format; clients receive strings)
// ---------------------------------------------------------------------------------------------------------------

/** Row → plain item with relative/absolute time strings. `now` is injectable for tests. */
export function toNotificationItem(row: NotificationRow, tz: string, now: Date | number = Date.now()): NotificationItem {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    body: row.body,
    href: row.href,
    entityType: row.entityType,
    entityId: row.entityId,
    read: row.readAt !== null,
    createdAt: row.createdAt.toISOString(),
    relative: formatRelative(row.createdAt, now),
    absolute: formatDateTime(row.createdAt, tz),
  };
}

/** Rows → items with one shared `now`, so every relative label in a page agrees. */
export function toNotificationItems(rows: readonly NotificationRow[], tz: string): NotificationItem[] {
  const now = Date.now();
  return rows.map((r) => toNotificationItem(r, tz, now));
}

/** Unread count + the 8 latest rows for the Topbar bell (docs/M2_SPEC.md §5 "UI"). */
export async function getBellData(db: TenantDb | TenantTx, session: Pick<Session, "user" | "tenant">): Promise<BellData> {
  const [count, rows] = await Promise.all([
    unreadCount(db, session),
    db.notification.findMany({
      where: { userId: session.user.id },
      select: rowSelect,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: BELL_ITEMS,
    }),
  ]);
  return { count, items: toNotificationItems(rows, session.tenant.timezone) };
}
