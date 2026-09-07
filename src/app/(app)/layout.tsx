import type { ReactNode } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { requireSession } from "@/lib/auth/guards";
import { logoutAction } from "@/app/(auth)/actions";

/**
 * Authenticated shell. `requireSession()` here only guarantees a valid session for the chrome; every page and
 * action still calls `requirePermission()` itself (docs/M1_SPEC.md §3).
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const session = await requireSession();
  return (
    <AppShell
      tenantName={session.tenant.name}
      user={{ name: session.user.name, email: session.user.email, role: session.user.role }}
      logoutAction={logoutAction}
    >
      {children}
    </AppShell>
  );
}
