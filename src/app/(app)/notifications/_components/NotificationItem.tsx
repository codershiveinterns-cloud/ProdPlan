"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { actionErrorMessage } from "@/components/forms/action-state";
import { NOTIFICATION_TYPE_LABELS, NOTIFICATIONS_CHANGED_EVENT, type NotificationItem as Item } from "@/lib/notifications/types";
import { cn } from "@/lib/utils";

import { deleteNotificationAction, markReadAction } from "../actions";
import { NotificationTypeIcon } from "./NotificationTypeIcon";

/** Tells the Topbar bell (and any other listener) that the unread count may have changed. */
export function announceNotificationsChanged(): void {
  window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED_EVENT));
}

export type NotificationItemProps = {
  item: Item;
  /** `popover`: dense row for the bell; `page`: full row with type label and a Dismiss button. */
  variant: "popover" | "page";
  /** Called after the row was activated (marked read) — the bell uses it to close the popover. */
  onActivated?: (item: Item) => void;
};

/**
 * One notification row. Activating it marks the row read (own rows only, server-side) and navigates to `href`
 * (or refreshes the list when there is none). The whole row is a single 44 px+ button for touch use.
 */
export function NotificationItem({ item, variant, onActivated }: NotificationItemProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [dismissing, startDismiss] = useTransition();
  const compact = variant === "popover";

  function activate() {
    startTransition(async () => {
      if (!item.read) {
        const fd = new FormData();
        fd.set("id", item.id);
        const result = await markReadAction(null, fd);
        if (result && !result.ok) {
          toast.error(actionErrorMessage(result.error));
          return;
        }
        announceNotificationsChanged();
      }
      onActivated?.(item);
      if (item.href) router.push(item.href);
      else router.refresh();
    });
  }

  function dismiss() {
    startDismiss(async () => {
      const fd = new FormData();
      fd.set("id", item.id);
      const result = await deleteNotificationAction(null, fd);
      if (result && !result.ok) {
        toast.error(actionErrorMessage(result.error));
        return;
      }
      announceNotificationsChanged();
      router.refresh();
    });
  }

  return (
    <li className={cn("flex items-stretch gap-1", !compact && "sm:gap-2")}>
      <button
        type="button"
        onClick={activate}
        disabled={pending}
        aria-busy={pending || undefined}
        aria-label={`${item.read ? "" : "Unread: "}${item.title}. ${item.body}. ${item.relative}`}
        className={cn(
          "flex min-h-11 min-w-0 flex-1 items-start gap-3 rounded-lg text-left transition-colors outline-none",
          "hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-60",
          compact ? "px-2 py-2" : "px-3 py-3 sm:px-4",
        )}
      >
        <NotificationTypeIcon type={item.type} className={compact ? "size-8" : undefined} />
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="flex items-start gap-2">
            <span className={cn("min-w-0 flex-1 text-sm leading-5", item.read ? "font-normal text-foreground" : "font-semibold text-foreground")}>
              <span className={compact ? "line-clamp-2" : "line-clamp-1"}>{item.title}</span>
            </span>
            {!item.read ? (
              <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" aria-hidden="true" data-testid="unread-dot" />
            ) : null}
          </span>
          <span className="line-clamp-1 text-sm text-muted-foreground">{item.body}</span>
          <span className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
            <time dateTime={item.createdAt} title={item.absolute}>
              {item.relative}
            </time>
            {!compact ? (
              <>
                <span aria-hidden="true">·</span>
                <span>{NOTIFICATION_TYPE_LABELS[item.type]}</span>
              </>
            ) : null}
          </span>
        </span>
      </button>
      {!compact ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="my-1 shrink-0 self-center text-muted-foreground"
          aria-label={`Dismiss: ${item.title}`}
          onClick={dismiss}
          disabled={dismissing}
        >
          <X />
        </Button>
      ) : null}
    </li>
  );
}
