"use client";

import { type CSSProperties, type ElementType, type ReactNode, useEffect, useRef } from "react";

/*
 * Scroll reveal (docs/LANDING_REFERENCE.md §3): one shared IntersectionObserver toggles `data-visible` on every
 * `[data-reveal]` element; the transition itself lives in globals.css (`.marketing [data-reveal]`), including the
 * `prefers-reduced-motion` override. Elements already in view on load reveal immediately.
 */

let observer: IntersectionObserver | null = null;

function observe(el: Element): () => void {
  if (typeof IntersectionObserver === "undefined") {
    el.setAttribute("data-visible", "");
    return () => {};
  }
  observer ??= new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          entry.target.setAttribute("data-visible", "");
          observer?.unobserve(entry.target);
        }
      }
    },
    { threshold: 0.15, rootMargin: "0px 0px -10% 0px" },
  );
  observer.observe(el);
  return () => observer?.unobserve(el);
}

export function Reveal({
  as: Tag = "div",
  delay = 0,
  className,
  children,
  ...rest
}: {
  as?: ElementType;
  /** Stagger in milliseconds (0, 100, 200 …). */
  delay?: number;
  className?: string;
  children: ReactNode;
  id?: string;
  "aria-labelledby"?: string;
}) {
  const ref = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    return observe(el);
  }, []);

  const style = delay ? ({ "--reveal-delay": `${delay}ms` } as CSSProperties) : undefined;
  return (
    <Tag ref={ref} data-reveal="" style={style} className={className} {...rest}>
      {children}
    </Tag>
  );
}
