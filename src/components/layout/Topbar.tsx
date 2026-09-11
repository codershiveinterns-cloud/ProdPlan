import { loadBellForCurrentUser } from "@/lib/notifications/bell";

import type { AppShellUser, LogoutAction } from "./AppShell";
import { MobileNav } from "./MobileNav";
import { NewMenu } from "./NewMenu";
import { NotificationBell } from "./NotificationBell";
import { UserMenu } from "./UserMenu";

/** Sticky top bar: menu trigger (< lg), tenant name, "+ New" quick actions, notification bell, user menu. */
export async function Topbar({
  tenantName,
  user,
  logoutAction,
}: {
  tenantName: string;
  user: AppShellUser;
  logoutAction: LogoutAction;
}) {
  const bell = await loadBellForCurrentUser();
  return (
    <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b bg-card/95 px-3 backdrop-blur supports-backdrop-filter:bg-card/80 md:gap-3 md:px-6 lg:px-8">
      <MobileNav role={user.role} tenantName={tenantName} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold text-foreground" title={tenantName}>
          {tenantName}
        </div>
      </div>
      <NewMenu role={user.role} />
      {bell ? <NotificationBell initial={bell} /> : null}
      <UserMenu user={user} logoutAction={logoutAction} />
    </header>
  );
}
