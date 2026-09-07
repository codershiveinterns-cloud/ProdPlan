import Link from "next/link";
import { Factory } from "lucide-react";

export function Wordmark() {
  return (
    <Link href="/login" className="mx-auto flex items-center gap-2.5 rounded-lg outline-none focus-visible:ring-3 focus-visible:ring-ring/50" aria-label="ProdPlan home">
      <span className="flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
        <Factory className="size-5" aria-hidden="true" />
      </span>
      <span className="text-2xl font-semibold tracking-tight">ProdPlan</span>
    </Link>
  );
}
