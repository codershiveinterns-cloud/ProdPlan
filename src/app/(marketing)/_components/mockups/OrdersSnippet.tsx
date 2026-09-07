import { Code, Due, MockCard, MockSnippet, MockTable, Pill } from "./frame";

/** Feature 1 — orders list with due hints and badges, plus the CSV import preview chips (brief §6.4, §8.5). */
export function OrdersSnippet() {
  return (
    <MockSnippet caption="Illustration of the orders list with overdue and due-today hints, priority and status badges, and a CSV import preview summarising valid rows, errors and new customers.">
      <MockCard>
        <MockTable
          head={
            <>
              <th>Order #</th>
              <th className="hidden @sm:table-cell">Customer</th>
              <th>Due</th>
              <th className="hidden @md:table-cell">Priority</th>
              <th>Status</th>
            </>
          }
        >
          <tr className="bg-red-50/40">
            <td>
              <Code>SO-000118</Code>
            </td>
            <td className="hidden @sm:table-cell">Bharat Autotech</td>
            <td>
              <Due tone="overdue">Overdue 3d</Due>
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
              <Code>SO-000121</Code>
            </td>
            <td className="hidden @sm:table-cell">Deccan Motors</td>
            <td>
              <Due tone="soon">Due today</Due>
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
          <span className="inline-flex h-8 items-center rounded-md bg-primary px-3 text-[11px] font-medium text-white">
            Import 38 valid rows
          </span>
        </div>
      </MockCard>
    </MockSnippet>
  );
}
