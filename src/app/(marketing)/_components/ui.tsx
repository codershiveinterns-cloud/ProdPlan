import type { ComponentProps, ReactNode } from "react";
import Link from "next/link";
import { Check } from "lucide-react";

import { cn } from "@/lib/utils";

/*
 * Landing-page primitives (docs/LANDING_REFERENCE.md §1 type scale and §4 theme). Plain markup on purpose: the
 * marketing route imports no auth/db modules; only presentational pieces (badges) are shared with the app.
 */

/** Centred content column: 1280 px max, 16/24/32 px gutters (reference container). */
export function Container({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8", className)} {...props} />;
}

/** Full-width section band: `py-16` on mobile, `py-20 sm:py-24` from tablet; `scroll-mt-24` for the fixed header. */
export function Section({ className, ...props }: ComponentProps<"section">) {
  return <section className={cn("scroll-mt-24 py-16 sm:py-20 lg:py-24", className)} {...props} />;
}

/** Small rounded pill label (section eyebrows, card labels). */
export function Pill({
  children,
  tone = "primary",
  className,
}: {
  children: ReactNode;
  tone?: "primary" | "amber" | "dark" | "neutral";
  className?: string;
}) {
  const tones = {
    primary: "border-teal-200/70 bg-primary-soft text-primary-soft-foreground",
    amber: "border-amber-200 bg-amber-50 text-amber-800",
    dark: "border-white/15 bg-white/10 text-(--band-muted)",
    neutral: "border-border bg-white text-stone-600",
  } as const;
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold tracking-wide",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Section intro: pill, H2 (Manrope), optional lead. */
export function SectionHeader({
  id,
  pill,
  title,
  lead,
  align = "center",
  tone = "light",
  className,
}: {
  id?: string;
  pill?: string;
  title: ReactNode;
  lead?: string;
  align?: "center" | "left";
  tone?: "light" | "dark";
  className?: string;
}) {
  const dark = tone === "dark";
  return (
    <div
      className={cn(
        "flex flex-col gap-4",
        align === "center" ? "mx-auto max-w-3xl items-center text-center" : "max-w-3xl items-start text-left",
        className,
      )}
    >
      {pill ? <Pill tone={dark ? "dark" : "primary"}>{pill}</Pill> : null}
      <h2
        id={id}
        className={cn(
          "text-3xl leading-[1.1] font-extrabold tracking-[-0.025em] sm:text-4xl lg:text-[2.75rem]",
          dark ? "text-(--band-foreground)" : "text-foreground",
        )}
      >
        {title}
      </h2>
      {lead ? (
        <p className={cn("max-w-[62ch] text-lg leading-relaxed text-pretty md:text-xl", dark ? "text-(--band-muted)" : "text-muted-foreground")}>
          {lead}
        </p>
      ) : null}
    </div>
  );
}

export type CtaVariant = "primary" | "outline" | "ghost" | "band-primary" | "band-outline";
type CtaSize = "sm" | "md" | "lg";

export const CTA_BASE =
  "lift lift-sm inline-flex shrink-0 items-center justify-center gap-2 rounded-lg font-semibold whitespace-nowrap outline-none select-none focus-visible:ring-3 focus-visible:ring-ring/50 active:translate-y-0 [&_svg]:size-4 [&_svg]:shrink-0";

const CTA_SIZE: Record<CtaSize, string> = {
  sm: "h-9 px-3.5 text-sm",
  md: "h-11 px-4 text-sm",
  lg: "h-12 px-6 text-base",
};

const CTA_VARIANT: Record<CtaVariant, string> = {
  primary: "bg-primary text-primary-foreground shadow-sm hover:bg-(--primary-hover) hover:shadow-lg hover:shadow-teal-900/15",
  outline: "border border-input bg-white text-foreground shadow-xs hover:border-stone-400 hover:bg-muted hover:shadow-md",
  ghost: "text-stone-700 hover:bg-muted hover:text-foreground hover:shadow-none",
  "band-primary": "bg-(--band-accent) text-stone-900 shadow-sm hover:bg-amber-300 hover:shadow-lg hover:shadow-black/20",
  "band-outline": "border border-white/30 text-white hover:border-white/60 hover:bg-white/10 focus-visible:ring-white/40",
};

export function ctaClasses(variant: CtaVariant = "primary", size: CtaSize = "lg", className?: string) {
  return cn(CTA_BASE, CTA_SIZE[size], CTA_VARIANT[variant], className);
}

/**
 * Call-to-action link. Route links use `next/link`; in-page anchors use a plain `<a>` so the browser handles the
 * (smooth) scroll natively with the header offset.
 */
export function CtaLink({
  href,
  variant = "primary",
  size = "lg",
  className,
  children,
  ...rest
}: {
  href: string;
  variant?: CtaVariant;
  size?: CtaSize;
  className?: string;
  children: ReactNode;
} & Omit<ComponentProps<"a">, "href" | "className" | "children">) {
  const classes = ctaClasses(variant, size, className);
  if (href.startsWith("#")) {
    return (
      <a href={href} className={classes} {...rest}>
        {children}
      </a>
    );
  }
  return (
    <Link href={href} className={classes} {...rest}>
      {children}
    </Link>
  );
}

/** Inline text link with arrow affordance. */
export function TextLink({
  href,
  tone = "light",
  className,
  children,
  ...rest
}: {
  href: string;
  tone?: "light" | "dark";
  className?: string;
  children: ReactNode;
} & Omit<ComponentProps<"a">, "href" | "className" | "children">) {
  const classes = cn(
    "group/link inline-flex items-center gap-1.5 rounded-sm font-semibold underline-offset-4 outline-none transition-colors hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 [&_svg]:size-4 [&_svg]:transition-transform [&_svg]:duration-200 hover:[&_svg]:translate-x-0.5",
    tone === "dark" ? "text-(--band-link) hover:text-white" : "text-primary hover:text-(--primary-hover)",
    className,
  );
  if (href.startsWith("#") || href.startsWith("/api/")) {
    return (
      <a href={href} className={classes} {...rest}>
        {children}
      </a>
    );
  }
  return (
    <Link href={href} className={classes} {...rest}>
      {children}
    </Link>
  );
}

/** The brand mark (public/brand/logo-mark.svg, recoloured to the teal primary). `mono` uses currentColor. */
export function BrandMark({ size = 32, mono = false, className }: { size?: number; mono?: boolean; className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 32 32"
      aria-hidden="true"
      focusable="false"
      className={cn("shrink-0", className)}
    >
      {mono ? null : <rect width="32" height="32" rx="8" fill="#0f766e" />}
      <rect x="7" y="7" width="12" height="4" rx="1.25" fill={mono ? "currentColor" : "#ffffff"} />
      <rect x="10" y="14" width="15" height="4" rx="1.25" fill={mono ? "currentColor" : "#ffffff"} />
      <rect x="13" y="21" width="6" height="4" rx="1.25" fill={mono ? "currentColor" : "#ffffff"} />
      <rect x="21" y="21" width="4" height="4" rx="1.25" fill={mono ? "currentColor" : "#fbbf24"} opacity={mono ? 0.55 : 1} />
    </svg>
  );
}

/** Horizontal lockup: mark + "ProdPlan" wordmark + tiny tagline (like the reference header). */
export function BrandLockup({
  href = "/",
  mono = false,
  tagline,
  className,
}: {
  href?: string;
  mono?: boolean;
  tagline?: string;
  className?: string;
}) {
  return (
    <Link
      href={href}
      aria-label="ProdPlan home"
      className={cn("inline-flex h-11 items-center gap-2.5 rounded-lg pr-2 outline-none focus-visible:ring-3 focus-visible:ring-ring/50", className)}
    >
      <BrandMark size={34} mono={mono} />
      <span className="flex flex-col leading-none">
        <span className={cn("font-heading text-[21px] font-bold tracking-[-0.02em]", mono ? "text-current" : "text-foreground")}>
          Prod<span className={mono ? "text-(--band-accent)" : "text-primary"}>Plan</span>
        </span>
        {tagline ? (
          <span className={cn("mt-1 text-[10px] font-medium tracking-wide", mono ? "text-(--band-subtle)" : "text-stone-500")}>{tagline}</span>
        ) : null}
      </span>
    </Link>
  );
}

/** Square icon tile used by cards; tints to the primary on `group-hover`. */
export function IconTile({
  children,
  tone = "primary",
  size = "md",
  className,
}: {
  children: ReactNode;
  tone?: "primary" | "amber" | "dark";
  size?: "sm" | "md";
  className?: string;
}) {
  const tones = {
    primary: "bg-primary-soft text-primary group-hover:bg-primary group-hover:text-white",
    amber: "bg-amber-50 text-amber-700 group-hover:bg-(--band-accent) group-hover:text-stone-900",
    dark: "bg-white/10 text-(--band-accent)",
  } as const;
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex shrink-0 items-center justify-center rounded-xl transition-colors duration-300",
        size === "md" ? "size-12 [&_svg]:size-6" : "size-10 [&_svg]:size-5",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/** ✓ bullet: teal check in a soft circle, optional bold lead-in. */
export function CheckItem({
  lead,
  children,
  tone = "light",
  className,
}: {
  lead?: string;
  children: ReactNode;
  tone?: "light" | "dark";
  className?: string;
}) {
  const dark = tone === "dark";
  return (
    <li className={cn("flex items-start gap-2.5 text-sm leading-6", dark ? "text-(--band-muted)" : "text-stone-600", className)}>
      <span
        aria-hidden="true"
        className={cn(
          "mt-1 flex size-4 shrink-0 items-center justify-center rounded-full",
          dark ? "bg-(--band-accent)/20 text-(--band-accent)" : "bg-primary-soft text-primary",
        )}
      >
        <Check className="size-3" strokeWidth={3} />
      </span>
      <span>
        {lead ? <strong className={cn("font-semibold", dark ? "text-white" : "text-foreground")}>{lead} </strong> : null}
        {children}
      </span>
    </li>
  );
}

/** Rounded-2xl white card with the warm shadow and hover lift. */
export function Card({ className, lift = true, ...props }: ComponentProps<"div"> & { lift?: boolean }) {
  return (
    <div
      className={cn("group card-shadow rounded-2xl bg-white p-6 ring-1 ring-stone-900/5", lift && "lift hover:ring-teal-700/20", className)}
      {...props}
    />
  );
}
