import Link from "next/link";

import { BrandMark } from "@/components/layout/BrandMark";

/** Brand lockup above the auth cards; links back to the landing page. */
export function Wordmark() {
  return (
    <Link
      href="/"
      className="mx-auto flex items-center gap-2.5 rounded-lg outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      aria-label="ProdPlan home"
    >
      <BrandMark size={40} className="rounded-[10px]" />
      <span className="font-heading text-2xl font-bold tracking-tight text-foreground">ProdPlan</span>
    </Link>
  );
}
