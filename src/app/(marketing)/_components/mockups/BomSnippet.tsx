import { TriangleAlert } from "lucide-react";

import { Code, MockCard, MockSnippet, MockTable, Pill } from "./frame";

/*
 * Features › Materials & BOM: the product's BOM editor with "Buildable from stock". Required = qty per unit × (1 + scrap);
 * buildable = floor(min(on hand / per-unit requirement)) = floor(min(64.5 / 0.651, 1200 / 4.08, 6 / 0.0515)) = 99 pcs.
 */
const ROWS = [
  { code: "RM-AL6061-BAR", name: "Aluminium bar 6061", perUnit: "0.620 kg", scrap: "5 %", onHand: "64.500 kg", tone: "short", covers: "99 pcs" },
  { code: "HW-M8-BOLT", name: "Bolt M8 × 30", perUnit: "4 pcs", scrap: "2 %", onHand: "1,200.000 pcs", tone: "covered", covers: "294 pcs" },
  { code: "PT-RAL9005", name: "Paint RAL 9005", perUnit: "0.050 l", scrap: "3 %", onHand: "6.000 l", tone: "covered", covers: "116 pcs" },
] as const;

export function BomSnippet() {
  return (
    <MockSnippet caption="Illustration of a product's bill of materials: three lines with quantity per unit, scrap allowance and stock on hand, and a banner stating that 99 pieces are buildable from stock, limited by the aluminium bar.">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <Code className="font-semibold">GX-40</Code>
          <span className="text-[11px] text-stone-500">Gearbox Housing · pcs</span>
          <Pill tone="active">Active</Pill>
        </div>
        <span className="inline-flex h-7 items-center rounded-md border border-input bg-white px-2 text-[11px] font-medium text-stone-700">
          + Add BOM line
        </span>
      </div>

      <div className="mt-2.5 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-2 text-[11px] leading-4 text-amber-900">
        <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-amber-700" />
        <span>
          Buildable from stock: <span className="font-semibold">99 pcs</span> · limited by <Code className="text-[11px]">RM-AL6061-BAR</Code> (64.500 kg on hand, below reorder 80.000 kg)
        </span>
      </div>

      <MockCard className="mt-2.5">
        <div className="px-3 pt-2.5 pb-1.5">
          <div className="text-[12px] font-semibold text-foreground">Bill of materials</div>
          <div className="text-[10px] text-stone-500">required per order = qty × qty per unit × (1 + scrap %)</div>
        </div>
        <MockTable
          head={
            <>
              <th>Material</th>
              <th className="text-right">Per unit</th>
              <th className="hidden text-right @sm:table-cell">Scrap</th>
              <th className="hidden text-right @md:table-cell">On hand</th>
              <th className="text-right">Covers</th>
            </>
          }
        >
          {ROWS.map((r) => (
            <tr key={r.code} className={r.tone === "short" ? "bg-amber-50/50" : undefined}>
              <td>
                <Code className="text-[11px]">{r.code}</Code>
                <span className="ml-1.5 hidden text-stone-500 @lg:inline">{r.name}</span>
              </td>
              <td className="text-right font-medium text-foreground">{r.perUnit}</td>
              <td className="hidden text-right @sm:table-cell">{r.scrap}</td>
              <td className="hidden text-right @md:table-cell">{r.onHand}</td>
              <td className={r.tone === "short" ? "text-right font-semibold text-amber-700" : "text-right text-stone-600"}>{r.covers}</td>
            </tr>
          ))}
        </MockTable>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-stone-100 px-3 py-2 text-[10px] text-stone-500">
          <span>Routing: CNC → Assembly → Paint · 3 operations</span>
          <span className="inline-flex items-center gap-1">
            <span className="size-2 rounded-full bg-amber-400" /> Limiting material
          </span>
        </div>
      </MockCard>
    </MockSnippet>
  );
}
