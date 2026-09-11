import type { Metadata } from "next";
import Link from "next/link";
import { BellOff, Inbox } from "lucide-react";

import { EmptyState } from "@/components/data/EmptyState";
import { FilterBar } from "@/components/data/FilterBar";
import { Pagination } from "@/components/data/Pagination";
import { FormField } from "@/components/forms/FormField";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { requirePagePermission } from "@/lib/auth/guards";
import { NATIVE_SELECT_CLASS } from "@/lib/machines/form-fields";
import type { SearchParams } from "@/lib/machines/list-params";
import { countActiveNotificationFilters, notificationListHref, parseNotificationListParams } from "@/lib/notifications/list-params";
import { listNotifications, toNotificationItems, unreadCount } from "@/lib/notifications/service";
import { NOTIFICATION_TYPE_LABELS, NOTIFICATION_TYPES } from "@/lib/notifications/types";

import { MarkAllReadButton } from "./_components/MarkAllReadButton";
import { NotificationItem } from "./_components/NotificationItem";

export const metadata: Metadata = { title: "Notifications" };

export default async function NotificationsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const { session, db } = await requirePagePermission("notifications:read");
  const params = parseNotificationListParams(await searchParams);
  const [{ rows, total, page, pageSize }, unread] = await Promise.all([
    listNotifications(db, session, { page: params.page, unreadOnly: params.unread, type: params.type }),
    unreadCount(db, session),
  ]);
  const items = toNotificationItems(rows, session.tenant.timezone);
  const activeFilters = countActiveNotificationFilters(params);
  const listHref = (patch: Partial<typeof params>) => notificationListHref(params, patch);

  return (
    <>
      <PageHeader
        title="Notifications"
        description="Schedule runs, conflicts, delivery risks and status changes across your plant."
        actions={<MarkAllReadButton unread={unread} />}
      />

      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {unread === 0 ? "No unread notifications" : `${unread} unread`}
        </p>
        <FilterBar activeCount={activeFilters} clearHref="/notifications" preserve={[]}>
          <FormField label="Type" htmlFor="type">
            <select name="type" defaultValue={params.type ?? ""} className={NATIVE_SELECT_CLASS}>
              <option value="">All types</option>
              {NOTIFICATION_TYPES.map((t) => (
                <option key={t} value={t}>
                  {NOTIFICATION_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
          </FormField>
          <label className="flex h-11 items-center gap-2 text-sm">
            <Checkbox name="unread" value="1" defaultChecked={params.unread} />
            Unread only
          </label>
        </FilterBar>
      </div>

      {items.length === 0 ? (
        <div className="rounded-xl border bg-card">
          {activeFilters > 0 && !(params.unread && !params.type) ? (
            <EmptyState
              icon={BellOff}
              title="No notifications match these filters"
              description="Try another type or clear the filters."
              action={
                <Button variant="outline" asChild>
                  <Link href="/notifications">Clear filters</Link>
                </Button>
              }
            />
          ) : (
            <EmptyState
              icon={Inbox}
              title="You're all caught up"
              description={
                params.unread
                  ? "Every notification has been read."
                  : "Schedule updates, conflicts, delivery risks and status changes will show up here."
              }
              action={
                params.unread ? (
                  <Button variant="outline" asChild>
                    <Link href="/notifications">Show all</Link>
                  </Button>
                ) : undefined
              }
            />
          )}
        </div>
      ) : (
        <ul className="divide-y rounded-xl border bg-card" aria-label={`Notifications, page ${page}, ${items.length} of ${total}`}>
          {items.map((item) => (
            <NotificationItem key={item.id} item={item} variant="page" />
          ))}
        </ul>
      )}

      <Pagination className="mt-4" page={page} pageSize={pageSize} total={total} makeHref={(p) => listHref({ page: p })} />
    </>
  );
}
