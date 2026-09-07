import { redirect } from "next/navigation";

import { canInTenant, requireSession } from "@/lib/auth/guards";

/** `/settings` has no content of its own: admins land on the Tenant tab, everyone else on Profile. */
export default async function SettingsIndexPage() {
  const session = await requireSession();
  redirect(canInTenant(session.user.role, session.tenant, "tenant:manage") ? "/settings/tenant" : "/settings/profile");
}
