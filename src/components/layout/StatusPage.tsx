import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

/**
 * Full-height centred message used by the 403 / 404 / error routes. Works both inside the app shell (when the
 * error happens below `(app)/layout.tsx`) and standalone in the root layout.
 */
export function StatusPage({
  code,
  icon: Icon,
  title,
  description,
  detail,
  actions,
}: {
  code: string;
  icon: LucideIcon;
  title: string;
  description: string;
  detail?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-1 items-center justify-center px-4 py-16">
      <div className="w-full max-w-md rounded-xl bg-card p-8 text-center ring-1 ring-foreground/10">
        <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <Icon className="size-7" aria-hidden="true" />
        </div>
        <p className="mt-5 text-xs font-semibold tracking-widest text-muted-foreground uppercase">{code}</p>
        <h1 className="mt-1 text-xl font-semibold tracking-tight text-foreground">{title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{description}</p>
        {detail ? <p className="mt-3 font-mono text-xs text-muted-foreground">{detail}</p> : null}
        {actions ? <div className="mt-6 flex flex-wrap justify-center gap-2">{actions}</div> : null}
      </div>
    </div>
  );
}
