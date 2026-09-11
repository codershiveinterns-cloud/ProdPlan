"use client";

import { useRouter, useSearchParams } from "next/navigation";

import { FormField } from "@/components/forms/FormField";
import { NATIVE_SELECT_CLASS } from "@/lib/machines/form-fields";

export type FloorFiltersProps = {
  workCenters: { id: string; code: string; name: string }[];
  machines: { id: string; code: string; name: string; workCenterId: string }[];
  workCenterId: string;
  machineId: string;
};

/**
 * Work center / machine filters (docs/M2_SPEC.md §4): plain Selects that navigate `/floor?workCenterId=&machineId=`
 * so the choice is remembered in the URL (shareable, survives a refresh). Picking a work center clears the machine
 * filter when it no longer belongs to it.
 */
export function FloorFilters({ workCenters, machines, workCenterId, machineId }: FloorFiltersProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function navigate(patch: Record<string, string>): void {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(patch)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    const qs = params.toString();
    router.push(qs ? `/floor?${qs}` : "/floor");
  }

  const filteredMachines = workCenterId ? machines.filter((m) => m.workCenterId === workCenterId) : machines;

  return (
    <div className="mb-6 flex flex-wrap items-end gap-3">
      <FormField label="Work center" htmlFor="floor-workCenterId">
        <select
          id="floor-workCenterId"
          className={NATIVE_SELECT_CLASS}
          value={workCenterId}
          onChange={(event) => navigate({ workCenterId: event.target.value, machineId: "" })}
        >
          <option value="">All work centers</option>
          {workCenters.map((wc) => (
            <option key={wc.id} value={wc.id}>
              {wc.code} · {wc.name}
            </option>
          ))}
        </select>
      </FormField>
      <FormField label="Machine" htmlFor="floor-machineId">
        <select
          id="floor-machineId"
          className={NATIVE_SELECT_CLASS}
          value={machineId}
          onChange={(event) => navigate({ machineId: event.target.value })}
        >
          <option value="">All machines</option>
          {filteredMachines.map((m) => (
            <option key={m.id} value={m.id}>
              {m.code} · {m.name}
            </option>
          ))}
        </select>
      </FormField>
    </div>
  );
}
