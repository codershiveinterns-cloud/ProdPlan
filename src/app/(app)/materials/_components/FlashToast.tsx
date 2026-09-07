"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";

/**
 * Fires one success toast for a `?flash=` message set by a redirecting Server Action, then strips the parameter
 * from the URL (so a reload or a shared link does not toast again). Renders nothing.
 */
export function FlashToast({ message }: { message: string | null }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const fired = useRef<string | null>(null);

  useEffect(() => {
    if (!message || fired.current === message) return;
    fired.current = message;
    toast.success(message);
    const params = new URLSearchParams(searchParams.toString());
    params.delete("flash");
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }, [message, pathname, router, searchParams]);

  return null;
}
