import { Filter, Search, Upload } from "lucide-react";

import { Code, Due, MockCard, MockSnippet, MockTable, Pill } from "./frame";

/** Features › Orders: the orders list with search, filter chips, due hints and badges, plus the CSV import preview. */
export function OrdersSnippet() {
  return (
    <MockSnippet caption="Illustration of the orders list filtered to open orders, with overdue and due-today hints, priority and status badges, and a CSV import preview summarising valid rows, errors and new customers.">
      <div className="mb-2.5 flex flex-wrap items-center gap-1.5">
        <span className="inline-flex h-7 min-w-0 flex-1 items-center gap-1.5 rounded-md border border-input bg-white px-2 text-[11px] text-stone-400 @md:max-w-48">
          <Search className="size-3" />
          Search orders, customers, SKUs…
        </span>
        <span className="inline-flex h-7 items-center gap-1 rounded-md border border-teal-200 bg-primary-soft px-2 text-[11px] font-medium text-primary-soft-foreground">
          <Filter className="size-3" />
          Status: Open
        </span>
        <span className="hidden h-7 items-center rounded-md border border-border bg-white px-2 text-[11px] font-medium text-stone-700 @sm:inline-flex">
          Due: next 7 days
        </span>
        <span className="ml-auto inline-flex h-7 items-center gap-1 rounded-md bg-primary px-2.5 text-[11px] font-medium text-white">
          <Upload className="size-3" />
          Import CSV
        </span>
      </div>
      <MockCard>
        <MockTable
          head={
            <>
              <th>Order #</th>
              <th className="hidden @sm:table-cell">Customer</th>
              <th className="hidden @2xl:table-cell">Product</th>
              <th className="hidden text-right @lg:table-cell">Qty</th>
              <th>Due</th>
              <th className="hidden @md:table-cell">Priority</th>
              <th>Status</th>
            </>
          }
        >
          <tr className="bg-red-50/40">
            <td>
              <Code>SO-000121</Code>
            </td>
            <td className="hidden @sm:table-cell">Deccan Motors</td>
            <td className="hidden @2xl:table-cell">GX-40 Gearbox Housing</td>
            <td className="hidden text-right @lg:table-cell">120 pcs</td>
            <td>
              <Due tone="overdue">Overdue 3d</Due>
            </td>
            <td className="hidden @md:table-cell">
              <Pill tone="urgent">Urgent</Pill>
            </td>
            <td>
              <Pill tone="queued">Queued</Pill>
            </td>
          </tr>
          <tr>
            <td>
              <Code>SO-000123</Code>
            </td>
            <td className="hidden @sm:table-cell">Kaveri Pumps</td>
            <td className="hidden @2xl:table-cell">PF-12 Pump Flange</td>
            <td className="hidden text-right @lg:table-cell">400 pcs</td>
            <td>
              <Due tone="soon">Due tomorrow</Due>
            </td>
            <td className="hidden @md:table-cell">
              <Pill tone="normal">Normal</Pill>
            </td>
            <td>
              <Pill tone="queued">Queued</Pill>
            </td>
          </tr>
          <tr>
            <td>
              <Code>SO-000118</Code>
            </td>
            <td className="hidden @sm:table-cell">Vikram Auto</td>
            <td className="hidden @2xl:table-cell">HB-200 Hydraulic Bracket</td>
            <td className="hidden text-right @lg:table-cell">250 pcs</td>
            <td>
              <Due tone="upcoming">Due in 2d</Due>
            </td>
            <td className="hidden @md:table-cell">
              <Pill tone="high">High</Pill>
            </td>
            <td>
              <Pill tone="inProgress">In progress</Pill>
            </td>
          </tr>
          <tr>
            <td>
              <Code>SO-000119</Code>
            </td>
            <td className="hidden @sm:table-cell">Nilgiri Tools</td>
            <td className="hidden @2xl:table-cell">HB-200 Hydraulic Bracket</td>
            <td className="hidden text-right @lg:table-cell">180 pcs</td>
            <td>
              <Due tone="upcoming">Due in 5d</Due>
            </td>
            <td className="hidden @md:table-cell">
              <Pill tone="normal">Normal</Pill>
            </td>
            <td>
              <Pill tone="onHold">On hold</Pill>
            </td>
          </tr>
        </MockTable>
      </MockCard>

      <MockCard className="mt-2.5 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="text-[11px] font-semibold text-foreground">Import preview · orders-sept.csv</div>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              <Pill tone="valid">38 valid</Pill>
              <Pill tone="errors">2 with errors</Pill>
              <Pill tone="warning">1 warning</Pill>
              <Pill tone="info">3 new customers</Pill>
            </div>
          </div>
          <span className="inline-flex h-8 items-center rounded-md bg-primary px-3 text-[11px] font-medium text-white">Import 38 valid rows</span>
        </div>
      </MockCard>
    </MockSnippet>
  );
}
