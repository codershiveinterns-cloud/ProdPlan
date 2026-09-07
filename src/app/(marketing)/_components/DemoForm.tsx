import type { ReactNode } from "react";
import { Play } from "lucide-react";

import { demoLoginAction } from "../_lib/demo";
import { type CtaVariant, ctaClasses } from "./ui";

/**
 * One-click demo entry (docs/M1_SPEC.md §6.9): a POST form whose action is `demoLoginAction("ADMIN")`. No password,
 * no JavaScript required. Server Component — the bound Server Action reference is serialisable, so the header can
 * receive this as a `ReactNode` prop.
 */
export function DemoForm({
  variant = "outline",
  size = "lg",
  className,
  children,
  icon = true,
}: {
  variant?: CtaVariant;
  size?: "sm" | "md" | "lg";
  className?: string;
  children: ReactNode;
  icon?: boolean;
}) {
  return (
    <form action={demoLoginAction.bind(null, "ADMIN")} className="contents">
      <button type="submit" className={ctaClasses(variant, size, className)}>
        {icon ? <Play aria-hidden="true" className="fill-current" /> : null}
        {children}
      </button>
    </form>
  );
}
