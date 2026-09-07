import { X } from "lucide-react";

import { Code, MockCard, MockSnippet, MockTable, Pill } from "./frame";

/** Feature 3 — machines list with work-center filter chips and live status badges (brief §8.5). */
export function MachinesSnippet() {
  return (
    <MockSnippet caption="Illustration of the machines list filtered to the CNC work center, showing active, maintenance and inactive machines and a red 'Down · Maintenance until 12:00' badge on a machine inside a maintenance window.">
      <div className="mb-2.5 flex flex-wrap items-center gap-1.5">
        <span className="inline-flex h-7 items-center gap-1 rounded-md border border-indigo-200 bg-indigo-50 px-2 text-[11px] font-medium text-indigo-700">
          Work center: CNC
          <X className="size-3" />
        </span>
        <span className="inline-flex h-7 items-center rounded-md border border-slate-200 bg-white px-2 text-[11px] font-medium text-slate-700">
          Status: All
        </span>
        <span className="ml-auto text-[11px] text-slate-500">5 machines</span>
      </div>
      <MockCard>
        <MockTable
          head={
            <>
              <th>Code</th>
              <th className="hidden @sm:table-cell">Name</th>
              <th className="hidden @md:table-cell">Work center</th>
              <th>Status</th>
            </>
          }
        >
          <tr>
            <td>
              <Code>CNC-01</Code>
            </td>
            <td className="hidden @sm:table-cell">Haas VF-2</td>
            <td className="hidden @md:table-cell">CNC</td>
            <td>
              <Pill tone="active">Active</Pill>
            </td>
          </tr>
          <tr>
            <td>
              <Code>CNC-02</Code>
            </td>
            <td className="hidden @sm:table-cell">Haas VF-2</td>
            <td className="hidden @md:table-cell">CNC</td>
            <td>
              <span className="inline-flex flex-wrap items-center gap-1">
                <Pill tone="active">Active</Pill>
                <Pill tone="down">Down · Maintenance until 12:00</Pill>
              </span>
            </td>
          </tr>
          <tr>
            <td>
              <Code>CNC-03</Code>
            </td>
            <td className="hidden @sm:table-cell">DMG Mori NLX</td>
            <td className="hidden @md:table-cell">CNC</td>
            <td>
              <Pill tone="maintenance">Maintenance</Pill>
            </td>
          </tr>
          <tr>
            <td>
              <Code>ASM-01</Code>
            </td>
            <td className="hidden @sm:table-cell">Assembly bench 1</td>
            <td className="hidden @md:table-cell">Assembly</td>
            <td>
              <Pill tone="active">Active</Pill>
            </td>
          </tr>
          <tr>
            <td>
              <Code>PNT-01</Code>
            </td>
            <td className="hidden @sm:table-cell">Paint booth</td>
            <td className="hidden @md:table-cell">Paint</td>
            <td>
              <Pill tone="inactive">Inactive</Pill>
            </td>
          </tr>
        </MockTable>
      </MockCard>
    </MockSnippet>
  );
}
