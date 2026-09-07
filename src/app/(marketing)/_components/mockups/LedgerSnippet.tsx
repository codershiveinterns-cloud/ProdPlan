import { Code, MockCard, MockSnippet, MockTable, Pill } from "./frame";

/** Feature 5 — material detail: on-hand card with the reorder flag and the stock ledger (brief §6.4, §8.5). */
export function LedgerSnippet() {
  return (
    <MockSnippet caption="Illustration of a material detail page: 64.500 kg on hand, flagged below its 80 kg reorder threshold, and a ledger of receipts and issues with the balance after each movement.">
      <div className="grid gap-2.5 @md:grid-cols-[minmax(0,11rem)_1fr]">
        <MockCard className="p-3">
          <div className="flex items-center justify-between gap-2">
            <Code className="font-semibold">RM-AL6061-BAR</Code>
          </div>
          <div className="mt-0.5 truncate text-[11px] text-slate-500">Aluminium bar 6061</div>
          <div className="mt-2 text-[11px] font-medium text-slate-500">Stock on hand</div>
          <div className="text-[22px] leading-7 font-semibold tracking-tight text-amber-700">64.500 kg</div>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <Pill tone="belowReorder">Below reorder</Pill>
            <span className="text-[10px] text-slate-500">Reorder at 80.000 kg</span>
          </div>
        </MockCard>

        <MockCard>
          <div className="flex items-center justify-between px-3 pt-2.5 pb-1.5">
            <span className="text-[12px] font-semibold text-slate-900">Stock ledger</span>
            <span className="inline-flex h-6 items-center rounded-md border border-slate-300 bg-white px-2 text-[10px] font-medium text-slate-700">
              Record movement
            </span>
          </div>
          <MockTable
            head={
              <>
                <th>When</th>
                <th>Type</th>
                <th className="text-right">Qty</th>
                <th className="hidden text-right @sm:table-cell">Balance</th>
                <th className="hidden @md:table-cell">Ref</th>
              </>
            }
          >
            <tr>
              <td className="text-slate-500">06 Sep 15:40</td>
              <td>Issue</td>
              <td className="text-right font-medium text-red-700">−18.500 kg</td>
              <td className="hidden text-right text-slate-900 @sm:table-cell">64.500 kg</td>
              <td className="hidden @md:table-cell">
                <Code className="text-[11px]">SO-000118</Code>
              </td>
            </tr>
            <tr>
              <td className="text-slate-500">05 Sep 09:12</td>
              <td>Receipt</td>
              <td className="text-right font-medium text-green-700">+40.000 kg</td>
              <td className="hidden text-right text-slate-900 @sm:table-cell">83.000 kg</td>
              <td className="hidden @md:table-cell">
                <Code className="text-[11px]">PO-4471</Code>
              </td>
            </tr>
            <tr>
              <td className="text-slate-500">02 Sep 11:05</td>
              <td>Adjustment</td>
              <td className="text-right font-medium text-red-700">−1.250 kg</td>
              <td className="hidden text-right text-slate-900 @sm:table-cell">43.000 kg</td>
              <td className="hidden text-slate-500 @md:table-cell">Count</td>
            </tr>
          </MockTable>
        </MockCard>
      </div>
    </MockSnippet>
  );
}
