import { CalendarRange, ClipboardList, Eye, ShieldCheck, Zap } from "lucide-react";
import type { Role } from "@/generated/prisma/enums";
import { demoLoginAction } from "@/app/(auth)/actions";
import { DemoProfileButton } from "@/app/(auth)/_components/demo-profile-button";

/** The four one-click demo profiles (docs/M1_SPEC.md §6.9 "Entry points"). */
export const DEMO_PROFILES: { role: Role; title: string; description: string }[] = [
  { role: "ADMIN", title: "Admin", description: "Full configuration" },
  { role: "PLANNER", title: "Planner", description: "Orders, materials, capacity" },
  { role: "SUPERVISOR", title: "Supervisor", description: "Floor updates on tablets" },
  { role: "VIEWER", title: "Viewer", description: "Read-only" },
];

const ICONS: Record<Role, React.ReactNode> = {
  ADMIN: <ShieldCheck aria-hidden="true" />,
  PLANNER: <CalendarRange aria-hidden="true" />,
  SUPERVISOR: <ClipboardList aria-hidden="true" />,
  VIEWER: <Eye aria-hidden="true" />,
};

/**
 * "Instant demo profiles" block: each card is its own `<form>` posting `demoLoginAction(role)`, so the button works
 * without JavaScript and shows a pending state with it.
 */
export function DemoProfiles() {
  return (
    <section aria-labelledby="demo-profiles-heading" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2
          id="demo-profiles-heading"
          className="inline-flex items-center gap-1.5 font-sans text-xs font-semibold tracking-wide text-primary uppercase"
        >
          <Zap className="size-3.5 text-brand-accent-ink" aria-hidden="true" />
          Instant demo profiles
        </h2>
        <span className="text-xs text-muted-foreground">no password required</span>
      </div>
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        {DEMO_PROFILES.map((p) => (
          <form key={p.role} action={demoLoginAction.bind(null, p.role)}>
            <DemoProfileButton title={p.title} description={p.description} icon={ICONS[p.role]} />
          </form>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        A shared sample plant with the same data for everyone. It is refreshed every day.
      </p>
    </section>
  );
}
