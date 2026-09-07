import type { ReactNode } from "react";

import type { Role } from "@/generated/prisma/enums";

import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";

export type AppShellUser = { name: string; email: string; role: Role };

/**
 * Server Action used by the user menu's "Sign out" item. A zero-argument `logoutAction()` is assignable here
 * (functions with fewer parameters are compatible), so auth-core can export `async function logoutAction()`.
 */
export type LogoutAction = (formData: FormData) => void | Promise<void>;

export type AppShellProps = {
  tenantName: string;
  user: AppShellUser;
  logoutAction: LogoutAction;
  children: ReactNode;
};

/**
 * Authenticated application frame: fixed sidebar at >= lg, a Sheet-based menu below, sticky topbar with tenant
 * name, "+ New" menu and user menu. Rendered by `src/app/(app)/layout.tsx` after `requireSession()`.
 * This is a Server Component; the interactive parts (active nav item, menus, sheet) are small client islands.
 */
export function AppShell({ tenantName, user, logoutAction, children }: AppShellProps) {
  return (
    <div className="flex min-h-dvh w-full">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-lg focus:bg-primary focus:px-4 focus:py-3 focus:text-sm focus:font-medium focus:text-primary-foreground focus:shadow-lg"
      >
        Skip to content
      </a>
      <Sidebar role={user.role} tenantName={tenantName} />
      <div className="flex min-w-0 flex-1 flex-col lg:pl-64">
        <Topbar tenantName={tenantName} user={user} logoutAction={logoutAction} />
        <main id="main" tabIndex={-1} className="flex-1 px-4 py-6 outline-none md:px-6 lg:px-8">
          <div className="mx-auto w-full max-w-7xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
