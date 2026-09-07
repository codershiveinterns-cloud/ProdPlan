import { TriangleAlert } from "lucide-react";

import { Code, Due, MockCard, MockSnippet, MockTable, Pill } from "./frame";

/*
 * Mockup C — material requirement for SO-000121 (brief §8.4). Required = qty × qty-per-unit × (1 + scrap):
 * 120 × 0.620 × 1.05 = 78.120 kg; 120 × 4 × 1.02 = 489.600 pcs; 120 × 0.050 × 1.03 = 6.180 l.
 * Buildable from unallocated stock = floor(min(64.5 / 0.651, 1200 / 4.08, 6 / 0.0515)) = 99 pcs.
 */
const ROWS = [
  { code: "RM-AL6061-BAR", name: "Aluminium bar 6061", required: "78.120 kg", onHand: "64.500 kg", short: "13.620 kg", tone: "short" },
  { code: "HW-M8-BOLT", name: "Bolt M8 × 30", required: "489.600 pcs", onHand: "1,200.000 pcs", short: "—", tone: "covered" },
  { code: "PT-RAL9005", name: "Paint RAL 9005", required: "6.180 l", onHand: "6.000 l", short: "0.180 l", tone: "short" },
] as const;

export function ShortageSnippet() {
  return (
    <MockSnippet caption="Illustration of an order's material requirement: three BOM lines with required and on-hand quantities, two flagged short, and a note that 99 pieces are buildable from unallocated stock.">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <Code className="font-semibold">SO-000121</Code>
          <span className="text-[11px] text-slate-500">GX-40 Gearbox Housing · 120 pcs</span>
          <Pill tone="queued">Queued</Pill>
          <Pill tone="urgent">Urgent</Pill>
        </div>
        <div className="text-[11px] text-slate-500">
          Due 07 Sep 2026 · <Due tone="soon">Due today</Due>
        </div>
      </div>

      <div className="mt-2.5 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-2 text-[11px] leading-4 text-amber-900">
        <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-amber-700" />
        <span>
          2 of 3 materials are short for this quantity · Buildable from unallocated stock:{" "}
          <span className="font-semibold">99 pcs</span>
        </span>
      </div>

      <MockCard className="mt-2.5">
        <div className="px-3 pt-2.5 pb-1.5">
          <div className="text-[12px] font-semibold text-slate-900">Material requirement</div>
          <div className="text-[10px] text-slate-500">qty × (qty per unit × (1 + scrap %))</div>
        </div>
        <MockTable
          head={
            <>
              <th>Material</th>
              <th className="text-right">Required</th>
              <th className="hidden text-right @sm:table-cell">On hand</th>
              <th className="text-right">Short by</th>
              <th className="hidden @md:table-cell">Status</th>
            </>
          }
        >
          {ROWS.map((r) => (
            <tr key={r.code} className={r.tone === "short" ? "bg-red-50/40" : undefined}>
              <td>
                <Code className="text-[11px]">{r.code}</Code>
                <span className="ml-1.5 hidden text-slate-500 @lg:inline">{r.name}</span>
              </td>
              <td className="text-right font-medium text-slate-900">{r.required}</td>
              <td className="hidden text-right @sm:table-cell">{r.onHand}</td>
              <td className={r.tone === "short" ? "text-right font-semibold text-red-700" : "text-right text-slate-400"}>
                {r.short}
              </td>
              <td className="hidden @md:table-cell">
                <Pill tone={r.tone}>{r.tone === "short" ? "Short" : "Covered"}</Pill>
              </td>
            </tr>
          ))}
        </MockTable>
        <div className="px-3 py-2 text-[10px] text-slate-500">vs unallocated stock on hand — does not net other open orders</div>
      </MockCard>
    </MockSnippet>
  );
}
