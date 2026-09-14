"use client";

/**
 * "Export" button (docs/M3_SPEC.md §8), mounted on Orders / Schedule / Floor / Audit log / Analytics. Each menu
 * item is a plain `<a href="/api/exports/...">` — a real navigable link, not a client-side fetch+blob download —
 * so it works without JS and downloads correctly even from a background tab. The dropdown chrome itself is
 * progressive enhancement (Radix, client-rendered) on top of those plain links.
 *
 * Callers pass the CURRENT page's filter query params (`filters`) so the export matches what's on screen ("export
 * what I'm looking at"), not the whole table. The caller is responsible for only rendering this component when
 * `can(role, "exports:create")` — there is no client-side permission check here; the server route is the authority.
 */
import { Download } from "lucide-react";

import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import type { ExportKind } from "@/lib/export/types";

export type ExportButtonProps = {
  kind: ExportKind;
  /** Current page filter query params (e.g. the parsed list params), forwarded to the export route as-is. */
  filters?: Record<string, string | number | boolean | undefined | null>;
  /** Trigger label — override when the button exports a specific slice rather than "the whole page" (e.g. Analytics). */
  label?: string;
};

function exportHref(kind: ExportKind, format: "CSV" | "PDF", filters?: ExportButtonProps["filters"]): string {
  const q = new URLSearchParams();
  q.set("format", format);
  for (const [key, value] of Object.entries(filters ?? {})) {
    if (value === undefined || value === null || value === "") continue;
    q.set(key, String(value));
  }
  return `/api/exports/${kind.toLowerCase()}?${q.toString()}`;
}

export function ExportButton({ kind, filters, label = "Export" }: ExportButtonProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline">
          <Download data-icon="inline-start" />
          {label}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem asChild>
          <a href={exportHref(kind, "CSV", filters)}>Export as CSV</a>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <a href={exportHref(kind, "PDF", filters)}>Export as PDF</a>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
