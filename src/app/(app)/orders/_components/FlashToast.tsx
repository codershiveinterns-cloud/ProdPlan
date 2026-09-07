"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { toast } from "sonner";

/** Messages behind `?flash=<key>` — set by actions that redirect after a successful mutation (spec §5 "Forms"). */
const FLASH_MESSAGES: Record<string, string> = {
  created: "Order created",
  updated: "Order saved",
  imported: "Orders imported",
  discarded: "Import discarded",
  "customer-created": "Customer created",
  "customer-updated": "Customer saved",
  "customer-deleted": "Customer deleted",
};

/**
 * Shows a success toast for the `flash` query parameter once, then strips the parameter from the URL (via the
 * History API, so there is no extra server round trip). Render once per page that is a redirect target.
 */
export function FlashToast() {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const flash = searchParams.get("flash");

  useEffect(() => {
    if (!flash) return;
    const message = FLASH_MESSAGES[flash];
    if (message) toast.success(message);
    const params = new URLSearchParams(searchParams.toString());
    params.delete("flash");
    const query = params.toString();
    window.history.replaceState(window.history.state, "", query ? `${pathname}?${query}` : pathname);
  }, [flash, pathname, searchParams]);

  return null;
}
