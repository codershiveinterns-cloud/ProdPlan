import Link from "next/link";
import { ArrowLeft, Check } from "lucide-react";
import { BrandMark } from "@/components/layout/BrandMark";
import { cn } from "@/lib/utils";

/*
 * Left-hand brand panel of /login (docs/M1_SPEC.md §6.9, docs/LANDING_REFERENCE.md §4 "Dark sections"): the tinted
 * teal gradient #0b2b2a → #0f3d3a with the 24 px dot grid. On < lg it collapses to `BrandStrip`, a compact header.
 */
const BAND_CLASS =
  "bg-[#0b2b2a] bg-[radial-gradient(rgb(255_255_255/0.06)_1px,transparent_1px),linear-gradient(160deg,#0b2b2a_0%,#0f3d3a_100%)] [background-size:24px_24px,100%_100%] text-white";

const VALUE_PROPS = [
  "Orders, machines, materials and shift calendars in one live record",
  "Per-plant data isolation with role-based access for every team member",
  "Every change kept in an immutable audit trail",
  "Works on the floor — tablets and phones included",
] as const;

function Lockup({ compact = false }: { compact?: boolean }) {
  return (
    <Link
      href="/"
      aria-label="ProdPlan home"
      className="inline-flex items-center gap-2.5 rounded-lg outline-none focus-visible:ring-3 focus-visible:ring-white/40"
    >
      <BrandMark size={compact ? 32 : 40} className={compact ? "rounded-lg" : "rounded-[10px]"} />
      <span className="flex flex-col leading-none">
        <span className={cn("font-heading font-bold tracking-tight text-white", compact ? "text-lg" : "text-2xl")}>
          ProdPlan
        </span>
        <span className="mt-1 text-[11px] font-medium tracking-wide text-[#99f6e4] uppercase">Production planning</span>
      </span>
    </Link>
  );
}

/** Full panel, `lg` and up. */
export function BrandPanel({ className }: { className?: string }) {
  return (
    <aside className={cn("relative flex-col justify-between overflow-hidden px-10 py-10 xl:px-16", BAND_CLASS, className)}>
      {/* Soft teal / amber glows (the only decoration besides the dot grid). */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-40 -left-32 size-[28rem] rounded-full bg-[#14b8a6]/15 blur-3xl"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-32 -bottom-40 size-[24rem] rounded-full bg-[#fbbf24]/10 blur-3xl"
      />

      <div className="relative flex items-center justify-between">
        <Lockup />
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 rounded-md text-sm font-medium text-[#99f6e4] outline-none hover:text-white focus-visible:ring-3 focus-visible:ring-white/40"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Back to home
        </Link>
      </div>

      <div className="relative my-12 max-w-lg">
        <h1 className="font-heading text-4xl leading-[1.1] font-extrabold tracking-tight text-balance text-white xl:text-5xl">
          Welcome back to the plant&rsquo;s single source of truth
        </h1>
        <p className="mt-5 text-base leading-relaxed text-[#99f6e4]">
          Sign in to see what is due, what is running and what is short — one live record for planners, supervisors
          and the office.
        </p>
        <ul className="mt-8 flex flex-col gap-3.5">
          {VALUE_PROPS.map((item) => (
            <li key={item} className="flex items-start gap-3 text-sm text-white/90">
              <span className="mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-[#fbbf24]/15 text-[#fbbf24] ring-1 ring-[#fbbf24]/40">
                <Check className="size-3" strokeWidth={3} aria-hidden="true" />
              </span>
              {item}
            </li>
          ))}
        </ul>
      </div>

      <figure className="relative max-w-md rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur-sm">
        <blockquote className="font-heading text-xl font-bold tracking-tight text-white">
          &ldquo;Calm control of the plant.&rdquo;
        </blockquote>
        <figcaption className="mt-2 text-sm text-[#99f6e4]">ProdPlan design principle</figcaption>
      </figure>
    </aside>
  );
}

/** Compact header strip shown instead of the panel below `lg`. */
export function BrandStrip({ className }: { className?: string }) {
  return (
    <header className={cn("flex items-center justify-between px-4 py-4 sm:px-6", BAND_CLASS, className)}>
      <Lockup compact />
      <Link
        href="/"
        className="inline-flex items-center gap-1 rounded-md text-sm font-medium text-[#99f6e4] outline-none hover:text-white focus-visible:ring-3 focus-visible:ring-white/40"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Home
      </Link>
    </header>
  );
}
