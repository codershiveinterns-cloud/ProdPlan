"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import type { Role } from "@/generated/prisma/enums";
import { can } from "@/lib/rbac";
import { cn } from "@/lib/utils";

import { NAV_GROUPS, isActivePath } from "./nav";

/**
 * Grouped navigation list (Plan / Master data / Settings). Client Component only for the active state
 * (`usePathname`); items are filtered with `can(role, permission)`.
 */
export function SidebarNav({ role, onNavigate }: { role: Role; onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <nav aria-label="Main navigation" className="flex flex-col gap-5 px-3">
      {NAV_GROUPS.map((group) => {
        const items = group.items.filter((item) => can(role, item.permission));
        if (items.length === 0) return null;
        return (
          <div key={group.label}>
            <div className="px-3 pb-1.5 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
              {group.label}
            </div>
            <ul className="flex flex-col gap-0.5">
              {items.map((item) => {
                const active = isActivePath(pathname, item);
                const Icon = item.icon;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={onNavigate}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "flex h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium outline-none transition-colors",
                        "focus-visible:ring-3 focus-visible:ring-ring/50",
                        active
                          ? "bg-sidebar-accent text-sidebar-accent-foreground"
                          : "text-sidebar-foreground hover:bg-muted hover:text-foreground",
                      )}
                    >
                      <Icon
                        className={cn("size-5 shrink-0", active ? "text-sidebar-primary" : "text-muted-foreground")}
                        aria-hidden="true"
                      />
                      <span className="truncate">{item.label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </nav>
  );
}
