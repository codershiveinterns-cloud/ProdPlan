import type { ReactNode } from "react";

/**
 * Auth routes. /login renders its own two-column layout (docs/M1_SPEC.md §6.9 "Login page layout"); /signup uses the
 * centered `AuthCardShell`. The layout itself only provides the full-height ground.
 */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return <main className="flex min-h-svh flex-1 flex-col bg-muted/40">{children}</main>;
}
