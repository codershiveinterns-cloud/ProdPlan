import type { Metadata } from "next";
import type { ReactNode } from "react";

import { PageHeader } from "@/components/layout/PageHeader";
import { canInTenant, requireSession } from "@/lib/auth/guards";

import { SettingsTabs, type SettingsTab } from "./_components/SettingsTabs";

// A plain string title in a nested layout would drop the root "%s · ProdPlan" template for the tab pages.
export const metadata: Metadata = { title: { default: "Settings", template: "%s · ProdPlan" } };

/**
 * Settings shell (docs/M1_SPEC.md §6.8): Tenant + Users tabs for ADMIN, Profile for everyone. The tabs are
 * navigation only — each page still calls `requirePermission()` itself. In the shared demo plant (§6.9) the
 * Tenant and Users tabs are hidden because those permissions are locked there.
 */
export default async function SettingsLayout({ children }: { children: ReactNode }) {
  const session = await requireSession();
  const tabs: SettingsTab[] = [
    ...(canInTenant(session.user.role, session.tenant, "tenant:manage") ? [{ label: "Tenant", href: "/settings/tenant" }] : []),
    ...(canInTenant(session.user.role, session.tenant, "users:manage") ? [{ label: "Users", href: "/settings/users" }] : []),
    { label: "Profile", href: "/settings/profile" },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Settings"
        description="Plant details, team access and your own account."
        className="mb-0"
      />
      <SettingsTabs items={tabs} />
      <div>{children}</div>
    </div>
  );
}
