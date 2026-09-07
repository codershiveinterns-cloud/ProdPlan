"use client";

import { type KeyboardEvent, type ReactNode, useId, useRef, useState } from "react";
import { Boxes, CalendarClock, ClipboardList, LayoutDashboard, ShieldCheck } from "lucide-react";

import { cn } from "@/lib/utils";

import type { FeatureKey } from "../_lib/content";

const ICONS: Record<FeatureKey, typeof ClipboardList> = {
  orders: ClipboardList,
  capacity: CalendarClock,
  materials: Boxes,
  dashboard: LayoutDashboard,
  access: ShieldCheck,
};

/**
 * Tabbed feature showcase (reference section 3). The panels are Server-rendered ReactNodes (mockup + copy) passed in
 * by the section; this component only owns the active index. WAI-ARIA tabs: arrow keys / Home / End move focus and
 * selection, `aria-controls` ties pills to panels, and the visible panel remounts so its cross-fade replays.
 */
export function FeatureTabs({
  tabs,
  panels,
}: {
  tabs: ReadonlyArray<{ key: FeatureKey; label: string }>;
  panels: ReadonlyArray<ReactNode>;
}) {
  const [active, setActive] = useState(0);
  const baseId = useId();
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const select = (index: number) => {
    const next = (index + tabs.length) % tabs.length;
    setActive(next);
    tabRefs.current[next]?.focus();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
    switch (e.key) {
      case "ArrowRight":
      case "ArrowDown":
        e.preventDefault();
        select(index + 1);
        break;
      case "ArrowLeft":
      case "ArrowUp":
        e.preventDefault();
        select(index - 1);
        break;
      case "Home":
        e.preventDefault();
        select(0);
        break;
      case "End":
        e.preventDefault();
        select(tabs.length - 1);
        break;
    }
  };

  return (
    <div>
      <div role="tablist" aria-label="Product areas" className="flex flex-wrap justify-center gap-2 sm:gap-3">
        {tabs.map((tab, i) => {
          const Icon = ICONS[tab.key];
          const selected = i === active;
          return (
            <button
              key={tab.key}
              ref={(el) => {
                tabRefs.current[i] = el;
              }}
              type="button"
              role="tab"
              id={`${baseId}-tab-${tab.key}`}
              aria-selected={selected}
              aria-controls={`${baseId}-panel-${tab.key}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => setActive(i)}
              onKeyDown={(e) => onKeyDown(e, i)}
              className={cn(
                "inline-flex h-11 items-center gap-2 rounded-full border px-4 text-sm font-semibold whitespace-nowrap outline-none transition-all duration-200 focus-visible:ring-3 focus-visible:ring-ring/50 sm:px-5",
                selected
                  ? "border-primary bg-primary text-white shadow-md shadow-teal-900/20"
                  : "border-border bg-white text-stone-700 hover:-translate-y-0.5 hover:border-stone-300 hover:text-foreground hover:shadow-sm",
              )}
            >
              <Icon aria-hidden="true" className="size-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {tabs.map((tab, i) =>
        i === active ? (
          <div
            key={tab.key}
            role="tabpanel"
            id={`${baseId}-panel-${tab.key}`}
            aria-labelledby={`${baseId}-tab-${tab.key}`}
            tabIndex={0}
            data-tabpanel=""
            className="mt-10 outline-none focus-visible:ring-3 focus-visible:ring-ring/50 sm:mt-12"
          >
            {panels[i]}
          </div>
        ) : null,
      )}
    </div>
  );
}
