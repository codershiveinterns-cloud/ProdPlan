import { cn } from "@/lib/utils";

/*
 * The ProdPlan mark (docs/DESIGN_BRIEF.md §9): a teal tile with three staggered "plan rows" and an amber slot for
 * the next job. Identical geometry to src/app/icon.svg. Plain SVG so it renders in Server Components, the auth
 * pages and the landing page alike; `mono` draws it in `currentColor` for dark or coloured surfaces.
 */
export const BRAND_TILE = "#0f766e";
export const BRAND_SLOT = "#fbbf24";

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
      {mono ? null : <rect width="32" height="32" rx="8" fill={BRAND_TILE} />}
      <rect x="7" y="7" width="12" height="4" rx="1.25" fill={mono ? "currentColor" : "#ffffff"} />
      <rect x="10" y="14" width="15" height="4" rx="1.25" fill={mono ? "currentColor" : "#ffffff"} />
      <rect x="13" y="21" width="6" height="4" rx="1.25" fill={mono ? "currentColor" : "#ffffff"} />
      <rect
        x="21"
        y="21"
        width="4"
        height="4"
        rx="1.25"
        fill={mono ? "currentColor" : BRAND_SLOT}
        opacity={mono ? 0.55 : 1}
      />
    </svg>
  );
}
