import type { ComponentProps, ReactNode } from "react";
import Link from "next/link";

import { cn } from "@/lib/utils";

/*
 * Landing-page primitives (docs/DESIGN_BRIEF.md §4–§5). Plain markup on purpose: the marketing route imports no
 * app components so it stays free of auth/db modules and matches the brief's type scale exactly.
 */

/** Centred content column: 1280 px max, 16/24/32 px gutters. */
export function Container({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8", className)} {...props} />;
}

/** Full-width section band with consistent vertical rhythm. */
export function Section({ className, ...props }: ComponentProps<"section">) {
  return <section className={cn("scroll-mt-20 py-16 sm:py-20 lg:py-24", className)} {...props} />;
}

/** 12 px uppercase label on an indigo-50 chip (7.07:1) or as plain slate-600 text. */
export function Eyebrow({
  children,
  chip = true,
  className,
}: {
  children: ReactNode;
  chip?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center text-[11px] leading-4 font-semibold tracking-[0.08em] uppercase sm:text-xs",
        chip ? "min-h-7 rounded-full bg-(--primary-soft) px-2.5 py-1 text-center text-indigo-700 sm:px-3" : "text-slate-600",
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Section intro: eyebrow, Display-2 heading, optional lead. Heading level is fixed at h2 (page has one h1). */
export function SectionHeader({
  id,
  eyebrow,
  title,
  lead,
  align = "center",
  tone = "light",
  className,
}: {
  id?: string;
  eyebrow?: string;
  title: string;
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
      {eyebrow ? (
        <Eyebrow chip={!dark} className={dark ? "text-(--band-accent)" : undefined}>
          {eyebrow}
        </Eyebrow>
      ) : null}
      <h2
        id={id}
        className={cn(
          "text-[1.75rem] leading-[1.1] font-bold tracking-[-0.02em] md:text-4xl",
          dark ? "text-(--band-foreground)" : "text-slate-900",
        )}
      >
        {title}
      </h2>
      {lead ? (
        <p className={cn("max-w-[60ch] text-lg leading-relaxed text-pretty md:text-xl", dark ? "text-(--band-muted)" : "text-slate-600")}>
          {lead}
        </p>
      ) : null}
    </div>
  );
}

type CtaVariant = "primary" | "outline" | "ghost" | "band-primary" | "band-outline";
type CtaSize = "md" | "lg";

const CTA_BASE =
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-lg font-medium whitespace-nowrap outline-none transition-colors duration-150 ease-out select-none focus-visible:ring-3 focus-visible:ring-ring/50 active:translate-y-px [&_svg]:size-4 [&_svg]:shrink-0";

const CTA_SIZE: Record<CtaSize, string> = {
  md: "h-11 px-4 text-sm",
  lg: "h-12 px-6 text-base",
};

const CTA_VARIANT: Record<CtaVariant, string> = {
  primary: "bg-primary text-primary-foreground shadow-xs hover:bg-(--primary-hover)",
  outline: "border border-input bg-card text-slate-900 shadow-xs hover:bg-muted",
  ghost: "text-slate-700 hover:bg-muted hover:text-slate-900",
  "band-primary": "bg-white text-slate-900 shadow-xs hover:bg-slate-100",
  "band-outline": "border border-slate-500 text-white hover:bg-white/10 focus-visible:ring-white/40",
};

/**
 * Call-to-action link. 48 px (`lg`) on the page body, 44 px (`md`) inside the nav bar. Route links use `next/link`;
 * in-page anchors (`#how-it-works`) use a plain `<a>` so the browser handles the scroll natively.
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
  const classes = cn(CTA_BASE, CTA_SIZE[size], CTA_VARIANT[variant], className);
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

/** Inline text link: indigo-600 on light surfaces, indigo-300 on the dark band. */
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
    "rounded-sm font-medium underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50",
    tone === "dark" ? "text-(--band-link)" : "text-indigo-600",
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

/** The brand mark (public/brand/logo-mark.svg inlined). `mono` renders in currentColor for dark surfaces. */
export function BrandMark({
  size = 32,
  mono = false,
  className,
}: {
  size?: number;
  mono?: boolean;
  className?: string;
}) {
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
      {mono ? null : <rect width="32" height="32" rx="8" fill="#4f46e5" />}
      <rect x="7" y="7" width="12" height="4" rx="1.25" fill={mono ? "currentColor" : "#ffffff"} />
      <rect x="10" y="14" width="15" height="4" rx="1.25" fill={mono ? "currentColor" : "#ffffff"} />
      <rect x="13" y="21" width="6" height="4" rx="1.25" fill={mono ? "currentColor" : "#ffffff"} />
      <rect
        x="21"
        y="21"
        width="4"
        height="4"
        rx="1.25"
        fill={mono ? "currentColor" : "#fbbf24"}
        opacity={mono ? 0.55 : 1}
      />
    </svg>
  );
}

/** Horizontal lockup: mark + "ProdPlan" wordmark rendered as live text. */
export function BrandLockup({
  href = "/",
  mono = false,
  className,
}: {
  href?: string;
  mono?: boolean;
  className?: string;
}) {
  return (
    <Link
      href={href}
      aria-label="ProdPlan home"
      className={cn(
        "inline-flex h-11 items-center gap-2.5 rounded-lg pr-2 outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
        className,
      )}
    >
      <BrandMark size={32} mono={mono} />
      <span className={cn("text-[21px] font-semibold tracking-[-0.5px]", mono ? "text-current" : "text-slate-900")}>
        ProdPlan
      </span>
    </Link>
  );
}

/** Square icon chip used by proof points, steps and feature cards. */
export function IconChip({
  children,
  tone = "indigo",
  className,
}: {
  children: ReactNode;
  tone?: "indigo" | "slate" | "amber" | "red" | "blue" | "green";
  className?: string;
}) {
  const tones: Record<NonNullable<typeof tone>, string> = {
    indigo: "bg-(--primary-soft) text-indigo-700",
    slate: "bg-slate-100 text-slate-600",
    amber: "bg-amber-50 text-amber-700",
    red: "bg-red-50 text-red-700",
    blue: "bg-blue-50 text-blue-700",
    green: "bg-green-50 text-green-700",
  };
  return (
    <span
      className={cn(
        "flex size-10 shrink-0 items-center justify-center rounded-lg [&_svg]:size-5",
        tones[tone],
        className,
      )}
      aria-hidden="true"
    >
      {children}
    </span>
  );
}
