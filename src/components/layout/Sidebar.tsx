import type { Role } from "@/generated/prisma/enums";

import { Brand } from "./Brand";
import { SidebarNav } from "./SidebarNav";

/** Fixed desktop sidebar (>= lg). Below lg the same navigation is rendered inside `MobileNav`'s Sheet. */
export function Sidebar({ role, tenantName }: { role: Role; tenantName: string }) {
  return (
    <aside
      aria-label="Primary"
      className="hidden border-r border-sidebar-border bg-sidebar text-sidebar-foreground lg:fixed lg:inset-y-0 lg:left-0 lg:z-30 lg:flex lg:w-64 lg:flex-col"
    >
      <Brand tenantName={tenantName} className="border-b border-sidebar-border" />
      <div className="flex-1 overflow-y-auto py-3">
        <SidebarNav role={role} />
      </div>
      <div className="border-t border-sidebar-border px-4 py-3 text-xs text-muted-foreground">
        ProdPlan · Milestone 1
      </div>
    </aside>
  );
}
