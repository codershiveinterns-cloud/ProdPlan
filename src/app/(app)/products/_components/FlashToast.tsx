"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";

/**
 * Shows a one-off success toast after an action redirected here with `?flash=<key>` (a redirect ends the
 * action, so `ToastOnResult` never sees a result) and strips the parameter from the URL again.
 */
export const FLASH_MESSAGES: Record<string, string> = {
  created: "Product created",
  saved: "Product saved",
  deleted: "Product deleted",
};

export function FlashToast({ flash }: { flash: string | undefined }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const shown = useRef<string | null>(null);

  useEffect(() => {
    if (!flash || shown.current === flash) return;
    shown.current = flash;
    const message = FLASH_MESSAGES[flash];
    if (message) toast.success(message);
    const params = new URLSearchParams(searchParams.toString());
    params.delete("flash");
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }, [flash, pathname, router, searchParams]);

  return null;
}
