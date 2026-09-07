"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";

import { cn } from "@/lib/utils";

const ITEM =
  "flex h-11 items-center rounded-lg px-3 text-base font-medium text-slate-700 outline-none hover:bg-muted hover:text-slate-900 focus-visible:ring-3 focus-visible:ring-ring/50";
const BUTTON =
  "inline-flex h-11 w-full items-center justify-center rounded-lg px-4 text-sm font-medium outline-none transition-colors duration-150 focus-visible:ring-3 focus-visible:ring-ring/50";

/**
 * The landing page's only client component: a hamburger toggle below `md` that reveals the anchor links and the
 * account actions. Pure React state, no portal — the panel is part of the sticky header so it needs no scroll lock.
 */
export function MobileMenu({
  signedIn,
  links,
}: {
  signedIn: boolean;
  links: ReadonlyArray<{ label: string; href: string }>;
}) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const close = () => setOpen(false);

  return (
    <div
      className="md:hidden"
      onKeyDown={(e) => {
        if (e.key === "Escape") close();
      }}
    >
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
        className="inline-flex size-11 items-center justify-center rounded-lg text-slate-700 outline-none hover:bg-muted hover:text-slate-900 focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        {open ? <X className="size-5" aria-hidden="true" /> : <Menu className="size-5" aria-hidden="true" />}
        <span className="sr-only">{open ? "Close menu" : "Open menu"}</span>
      </button>

      <div
        id={panelId}
        hidden={!open}
        className="absolute inset-x-0 top-full border-b border-slate-200 bg-background shadow-md"
      >
        <nav aria-label="Site" className="px-4 py-3">
          <ul className="flex flex-col gap-0.5">
            {links.map((link) => (
              <li key={link.href}>
                <a href={link.href} onClick={close} className={ITEM}>
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex flex-col gap-2 border-t border-slate-200 pt-3">
            {signedIn ? (
              <Link href="/dashboard" onClick={close} className={cn(BUTTON, "bg-primary text-primary-foreground shadow-xs")}>
                Open dashboard
              </Link>
            ) : (
              <>
                <Link
                  href="/login"
                  onClick={close}
                  className={cn(BUTTON, "border border-input bg-card text-slate-900 shadow-xs hover:bg-muted")}
                >
                  Sign in
                </Link>
                <Link href="/signup" onClick={close} className={cn(BUTTON, "bg-primary text-primary-foreground shadow-xs")}>
                  Get started
                </Link>
              </>
            )}
          </div>
        </nav>
      </div>
    </div>
  );
}
