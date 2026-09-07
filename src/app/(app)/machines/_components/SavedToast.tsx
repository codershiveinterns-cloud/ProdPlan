"use client";

import { useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";

/**
 * Success toast after a redirecting Server Action (`redirect("/machines/abc?saved=created")`): shows the message
 * mapped to `?saved=<key>` once and strips the parameter from the URL so a reload does not repeat it.
 */
export function SavedToast({ messages }: { messages: Record<string, string> }) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const key = searchParams.get("saved");
  const message = key ? messages[key] : undefined;

  useEffect(() => {
    if (!key) return;
    if (message) toast.success(message);
    const params = new URLSearchParams(searchParams.toString());
    params.delete("saved");
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }, [key, message, pathname, router, searchParams]);

  return null;
}
