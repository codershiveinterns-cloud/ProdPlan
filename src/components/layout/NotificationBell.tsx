"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { Bell, CheckCheck, Inbox } from "lucide-react";
import { toast } from "sonner";

import { loadBellAction, markAllReadAction } from "@/app/(app)/notifications/actions";
import { announceNotificationsChanged, NotificationItem } from "@/app/(app)/notifications/_components/NotificationItem";
import { actionErrorMessage } from "@/components/forms/action-state";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { BELL_POLL_MS, NOTIFICATIONS_CHANGED_EVENT, type BellData, type NotificationItem as Item } from "@/lib/notifications/types";

const UNREAD_COUNT_URL = "/api/notifications/unread-count";

/** "99+" cap for the badge. */
export function formatBadgeCount(count: number): string {
  return count > 99 ? "99+" : String(count);
}

/**
 * Topbar bell (docs/M2_SPEC.md §5 "UI"): unread badge, polling of GET /api/notifications/unread-count every 60 s
 * (plus on window focus and after local changes), and a popover with the 8 latest notifications. `initial` comes
 * from the Topbar (Server Component) so the first paint already shows the right count and rows.
 */
export function NotificationBell({ initial }: { initial: BellData }) {
  const [count, setCount] = useState(initial.count);
  const [items, setItems] = useState<Item[]>(initial.items);
  const [open, setOpen] = useState(false);
  const [refreshing, startRefresh] = useTransition();
  const [marking, startMarkAll] = useTransition();
  // Set once the API answers 401 (signed out elsewhere): stop polling instead of hammering the endpoint.
  const stopped = useRef(false);

  const pollCount = useCallback(async () => {
    if (stopped.current || document.visibilityState === "hidden") return;
    try {
      const res = await fetch(UNREAD_COUNT_URL, { cache: "no-store", credentials: "same-origin" });
      if (res.status === 401 || res.status === 403) {
        stopped.current = true;
        return;
      }
      if (!res.ok) return;
      const data = (await res.json()) as { count?: unknown };
      if (typeof data.count === "number") setCount(data.count);
    } catch {
      // Offline / aborted: keep the last known count and try again next tick.
    }
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => void pollCount(), BELL_POLL_MS);
    const onFocus = () => void pollCount();
    const onVisible = () => {
      if (document.visibilityState === "visible") void pollCount();
    };
    window.addEventListener("focus", onFocus);
    window.addEventListener(NOTIFICATIONS_CHANGED_EVENT, onFocus);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener(NOTIFICATIONS_CHANGED_EVENT, onFocus);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [pollCount]);

  function refreshItems() {
    startRefresh(async () => {
      const result = await loadBellAction(null, new FormData());
      if (result?.ok && result.data) {
        setItems(result.data.items);
        setCount(result.data.count);
      }
    });
  }

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (next) refreshItems();
  }

  function markAll() {
    startMarkAll(async () => {
      const result = await markAllReadAction(null, new FormData());
      if (result && !result.ok) {
        toast.error(actionErrorMessage(result.error));
        return;
      }
      setItems((prev) => prev.map((i) => ({ ...i, read: true })));
      setCount(0);
      announceNotificationsChanged();
    });
  }

  const hasUnread = count > 0;

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label="Notifications" aria-describedby="notification-bell-count">
          <Bell className="size-5" aria-hidden="true" />
          {hasUnread ? (
            <span
              aria-hidden="true"
              className="absolute top-1 right-1 flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] leading-none font-semibold text-white tabular-nums"
              data-testid="unread-badge"
            >
              {formatBadgeCount(count)}
            </span>
          ) : null}
          <span id="notification-bell-count" className="sr-only">
            {hasUnread ? `${count} unread` : "No unread notifications"}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[calc(100vw-1rem)] max-w-96 gap-0 p-0">
        <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
          <h2 className="text-sm font-semibold">Notifications</h2>
          <span className="text-xs text-muted-foreground" aria-live="polite">
            {refreshing ? "Refreshing…" : hasUnread ? `${count} unread` : "All read"}
          </span>
        </div>
        {items.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
            <span className="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <Inbox className="size-5" aria-hidden="true" />
            </span>
            <p className="text-sm font-medium">You&rsquo;re all caught up</p>
            <p className="text-xs text-muted-foreground">New alerts will show up here.</p>
          </div>
        ) : (
          <ul className="flex max-h-[min(60dvh,28rem)] flex-col divide-y overflow-y-auto p-1" aria-label="Latest notifications">
            {items.map((item) => (
              <NotificationItem key={item.id} item={item} variant="popover" onActivated={() => setOpen(false)} />
            ))}
          </ul>
        )}
        <div className="flex items-center justify-between gap-2 border-t p-1.5">
          <Button variant="ghost" asChild>
            <Link href="/notifications" onClick={() => setOpen(false)}>
              View all
            </Link>
          </Button>
          <Button variant="ghost" onClick={markAll} disabled={!hasUnread || marking}>
            <CheckCheck data-icon="inline-start" />
            Mark all as read
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
