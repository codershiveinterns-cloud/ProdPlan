"use client";

import { type ReactNode, useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, ChevronDown, Menu, X } from "lucide-react";

import { cn } from "@/lib/utils";

import { NAV_LINKS, PRODUCT_MENU, SITE } from "../_lib/content";
import { BrandLockup, ctaClasses } from "./ui";
import { appHref } from "../_lib/static";

const NAV_ITEM =
  "inline-flex h-10 items-center gap-1 rounded-lg px-3 text-sm font-medium text-stone-700 outline-none transition-colors duration-200 hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50";

/**
 * Fixed translucent header (reference section 0): `py-4` at the top, tightens to `py-3` and gains a shadow after
 * 8 px of scroll; Product dropdown (hover, click and keyboard); hamburger panel below `lg` with the same links and
 * CTAs. The demo buttons are Server-rendered forms passed in as nodes (they post a Server Action).
 */
export function SiteHeader({
  signedIn,
  demoButton,
  demoPill,
}: {
  signedIn: boolean;
  /** "View demo" outline button for the desktop bar. */
  demoButton: ReactNode;
  /** Compact "View demo" pill kept next to the hamburger on mobile. */
  demoPill: ReactNode;
}) {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const [productOpen, setProductOpen] = useState(false);
  const panelId = useId();
  const productId = useId();
  const productRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Close the dropdown / mobile panel on Escape and on outside click; close the panel when the viewport grows.
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        setProductOpen(false);
      }
    };
    const onClick = (e: MouseEvent) => {
      if (productRef.current && !productRef.current.contains(e.target as Node)) setProductOpen(false);
    };
    const mq = window.matchMedia("(min-width: 1024px)");
    const onChange = () => {
      if (mq.matches) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    mq.addEventListener("change", onChange);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
      mq.removeEventListener("change", onChange);
    };
  }, []);

  const close = () => setOpen(false);

  return (
    <header
      data-scrolled={scrolled ? "" : undefined}
      className={cn(
        "marketing-header fixed inset-x-0 top-0 z-40 border-b bg-background/90 backdrop-blur-md supports-backdrop-filter:bg-background/80",
        scrolled ? "border-border py-1.5" : "border-transparent py-2.5",
      )}
    >
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
        <BrandLockup href="/" tagline={SITE.tagline} className="-ml-1" />

        {/* Desktop nav */}
        <nav aria-label="Site" className="hidden items-center gap-1 lg:flex">
          <div
            ref={productRef}
            className="group/product relative"
            onMouseEnter={() => setProductOpen(true)}
            onMouseLeave={() => setProductOpen(false)}
          >
            <button
              type="button"
              aria-haspopup="true"
              aria-expanded={productOpen}
              aria-controls={productId}
              onClick={() => setProductOpen((o) => !o)}
              className={cn(NAV_ITEM, productOpen && "bg-muted text-foreground")}
            >
              Product
              <ChevronDown aria-hidden="true" className={cn("size-4 transition-transform duration-200", productOpen && "rotate-180")} />
            </button>
            <div
              id={productId}
              hidden={!productOpen}
              className="absolute top-full left-0 pt-2"
            >
              <ul className="card-shadow w-80 animate-fade-in rounded-2xl bg-white p-2 ring-1 ring-stone-900/5">
                {PRODUCT_MENU.map((item) => (
                  <li key={item.label}>
                    <div aria-disabled="true" className="flex cursor-default flex-col gap-0.5 rounded-xl px-3 py-2.5">
                      <span className="text-sm font-semibold text-foreground">{item.label}</span>
                      <span className="text-xs leading-5 text-stone-600">{item.description}</span>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
          {NAV_LINKS.map((link) => (
            <span key={link.href} aria-disabled="true" className={cn(NAV_ITEM, "cursor-default")}>
              {link.label}
            </span>
          ))}
        </nav>

        {/* Right actions */}
        <div className="flex items-center gap-2">
          {signedIn ? (
            <Link href="/dashboard" className={cn(ctaClasses("primary", "md"), "hidden lg:inline-flex")}>
              Open dashboard
              <ArrowRight aria-hidden="true" />
            </Link>
          ) : (
            <>
              <button type="button" disabled aria-disabled="true" className={cn(ctaClasses("ghost", "md"), "hidden cursor-not-allowed opacity-60 lg:inline-flex")}>
                Sign in
              </button>
              <div className="hidden lg:contents">{demoButton}</div>
              <Link href={appHref("/signup")} className={cn(ctaClasses("primary", "md"), "hidden lg:inline-flex")}>
                Create your workspace
                <ArrowRight aria-hidden="true" />
              </Link>
            </>
          )}

          {/* Mobile: compact pill + hamburger */}
          <div className="flex items-center gap-2 lg:hidden">
            {signedIn ? (
              <Link href="/dashboard" className={ctaClasses("primary", "sm")}>
                Dashboard
              </Link>
            ) : (
              demoPill
            )}
            <button
              type="button"
              aria-label="Toggle navigation menu"
              aria-expanded={open}
              aria-controls={panelId}
              onClick={() => setOpen((o) => !o)}
              className="inline-flex size-11 items-center justify-center rounded-lg text-stone-700 outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              {open ? <X className="size-5" aria-hidden="true" /> : <Menu className="size-5" aria-hidden="true" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile panel */}
      <div
        id={panelId}
        hidden={!open}
        className="animate-fade-in absolute inset-x-0 top-full max-h-[calc(100svh-4.5rem)] overflow-y-auto border-b border-border bg-background shadow-xl lg:hidden"
      >
        <nav aria-label="Site" className="mx-auto max-w-7xl px-4 py-4 sm:px-6">
          <p className="px-3 pb-1 text-[11px] font-semibold tracking-wider text-stone-500 uppercase">Product</p>
          <ul className="flex flex-col">
            {PRODUCT_MENU.map((item) => (
              <li key={item.label}>
                <span aria-disabled="true" className="flex min-h-11 cursor-default items-center rounded-lg px-3 py-2 text-base font-medium text-stone-700">
                  {item.label}
                </span>
              </li>
            ))}
          </ul>
          <ul className="mt-2 flex flex-col border-t border-border pt-2">
            {NAV_LINKS.map((link) => (
              <li key={link.href}>
                <span aria-disabled="true" className="flex min-h-11 cursor-default items-center rounded-lg px-3 py-2 text-base font-medium text-stone-700">
                  {link.label}
                </span>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex flex-col gap-2 border-t border-border pt-4">
            {signedIn ? (
              <Link href="/dashboard" onClick={close} className={ctaClasses("primary", "md", "w-full")}>
                Open dashboard
                <ArrowRight aria-hidden="true" />
              </Link>
            ) : (
              <>
                <Link href={appHref("/signup")} onClick={close} className={ctaClasses("primary", "md", "w-full")}>
                  Create your workspace
                  <ArrowRight aria-hidden="true" />
                </Link>
                <button type="button" disabled aria-disabled="true" className={ctaClasses("outline", "md", "w-full cursor-not-allowed opacity-60")}>
                  Sign in
                </button>
              </>
            )}
          </div>
        </nav>
      </div>
    </header>
  );
}
