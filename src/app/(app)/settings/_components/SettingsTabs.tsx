"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

export type SettingsTab = { label: string; href: string };

/**
 * Settings section tabs rendered as links (each tab is its own route). The active tab follows the pathname
 * prefix; the Radix Tabs primitive only provides the roving-focus/ARIA behaviour.
 */
export function SettingsTabs({ items }: { items: SettingsTab[] }) {
  const pathname = usePathname();
  const active =
    items.find((item) => pathname === item.href || pathname.startsWith(`${item.href}/`))?.href ?? items[0]?.href ?? "";

  return (
    <Tabs value={active} className="w-full">
      <TabsList variant="line" aria-label="Settings sections" className="h-11 w-full justify-start border-b border-border">
        {items.map((item) => (
          <TabsTrigger key={item.href} value={item.href} asChild className="h-11 flex-none px-4">
            <Link href={item.href} aria-current={item.href === active ? "page" : undefined}>
              {item.label}
            </Link>
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
