import {
  Boxes,
  CalendarClock,
  CalendarRange,
  ClipboardList,
  Cog,
  Factory,
  LayoutDashboard,
  Package,
  Settings,
  Users,
  Wrench,
  type LucideIcon,
} from "lucide-react";

import type { Permission } from "@/lib/rbac";

/**
 * Sidebar navigation (docs/M1_SPEC.md §5 "Navigation"). Items are filtered per role with `can(role, permission)`
 * in `SidebarNav`; the server-side `requirePermission()` in each page remains the authority.
 */
export type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  permission: Permission;
  /** Pathname prefix used for the active state when it differs from `href` (e.g. /settings/*). */
  activePrefix?: string;
};

export type NavGroup = { label: string; items: NavItem[] };

export const NAV_GROUPS: NavGroup[] = [
  {
    label: "Plan",
    items: [
      { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard, permission: "dashboard:read" },
      { label: "Orders", href: "/orders", icon: ClipboardList, permission: "orders:read" },
      { label: "Schedule", href: "/schedule", icon: CalendarRange, permission: "schedule:read" },
      { label: "Floor", href: "/floor", icon: Wrench, permission: "schedule:read" },
    ],
  },
  {
    label: "Master data",
    items: [
      { label: "Customers", href: "/customers", icon: Users, permission: "customers:read" },
      { label: "Products", href: "/products", icon: Package, permission: "products:read" },
      { label: "Materials", href: "/materials", icon: Boxes, permission: "materials:read" },
      { label: "Machines", href: "/machines", icon: Cog, permission: "machines:read" },
      { label: "Work centers", href: "/work-centers", icon: Factory, permission: "machines:read" },
      { label: "Shift calendars", href: "/calendars", icon: CalendarClock, permission: "machines:read" },
    ],
  },
  {
    label: "Settings",
    items: [
      // /settings has no index page (the settings layout renders tabs); Profile exists for every role.
      {
        label: "Settings",
        href: "/settings/profile",
        icon: Settings,
        permission: "profile:self",
        activePrefix: "/settings",
      },
    ],
  },
];

/** Topbar "+ New" quick actions, in display order. Filtered with `can()` in `NewMenu`. */
export const NEW_MENU_ITEMS: NavItem[] = [
  { label: "Order", href: "/orders/new", icon: ClipboardList, permission: "orders:write" },
  { label: "Customer", href: "/customers/new", icon: Users, permission: "customers:write" },
  { label: "Product", href: "/products/new", icon: Package, permission: "products:write" },
  { label: "Material", href: "/materials/new", icon: Boxes, permission: "materials:write" },
  { label: "Machine", href: "/machines/new", icon: Cog, permission: "machines:write" },
];

/** Active item = pathname prefix match on whole path segments ("/orders" matches "/orders/abc", not "/orders-x"). */
export function isActivePath(pathname: string, item: Pick<NavItem, "href" | "activePrefix">): boolean {
  const prefix = item.activePrefix ?? item.href;
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}
