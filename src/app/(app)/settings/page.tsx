import { redirect } from "next/navigation";

import { requireSession } from "@/lib/auth/guards";
import { can } from "@/lib/rbac";

/** `/settings` has no content of its own: admins land on the Tenant tab, everyone else on Profile. */
export default async function SettingsIndexPage() {
  const session = await requireSession();
  redirect(can(session.user.role, "tenant:manage") ? "/settings/tenant" : "/settings/profile");
}
