import type { Metadata } from "next";
import { Wrench } from "lucide-react";

import { EmptyState } from "@/components/data/EmptyState";
import { PageHeader } from "@/components/layout/PageHeader";
import { requirePagePermission } from "@/lib/auth/guards";
import { todayInTz } from "@/lib/dates";
import { workCenterOptions } from "@/lib/machines/work-centers";
import { can } from "@/lib/rbac";
import { floorOperations } from "@/lib/scheduling/queries";

import { FloorFilters } from "./_components/FloorFilters";
import { FloorMachineCard } from "./_components/FloorMachineCard";

export const metadata: Metadata = { title: "Floor" };

type SearchParams = Record<string, string | string[] | undefined>;

function first(v: string | string[] | undefined): string {
  return (Array.isArray(v) ? v[0] : v) ?? "";
}

function idParam(v: string): string {
  const s = v.trim();
  return /^[A-Za-z0-9_-]{1,64}$/.test(s) ? s : "";
}

export default async function FloorPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const { session, db } = await requirePagePermission("schedule:read");
  const sp = await searchParams;
  const workCenterId = idParam(first(sp.workCenterId));
  const machineId = idParam(first(sp.machineId));
  const tz = session.tenant.timezone;
  const today = todayInTz(tz);
  const role = session.user.role;
  const canAct = can(role, "operations:status");

  const [machines, workCenters, machineOptions] = await Promise.all([
    floorOperations(db, {
      date: today,
      tz,
      ...(workCenterId ? { workCenterId } : {}),
      ...(machineId ? { machineId } : {}),
    }),
    workCenterOptions(db),
    db.machine.findMany({
      where: workCenterId ? { workCenterId } : {},
      select: { id: true, code: true, name: true, workCenterId: true },
      orderBy: { code: "asc" },
    }),
  ]);

  const workCenterLabel = new Map(workCenters.map((wc) => [wc.id, `${wc.code} · ${wc.name}`]));

  return (
    <>
      <PageHeader
        title="Floor"
        description="Today's and overdue operations by machine — start, pause, resume and complete."
      />
      <FloorFilters
        workCenters={workCenters}
        machines={machineOptions}
        workCenterId={workCenterId}
        machineId={machineId}
      />
      {machines.length === 0 ? (
        <EmptyState
          icon={Wrench}
          title="No machines match these filters"
          description="Try a different work center or machine."
        />
      ) : (
        <div className="flex flex-col gap-6">
          {machines.map((machine) => (
            <FloorMachineCard
              key={machine.id}
              machine={machine}
              workCenterLabel={workCenterLabel.get(machine.workCenterId) ?? null}
              tz={tz}
              role={role}
              canAct={canAct}
            />
          ))}
        </div>
      )}
    </>
  );
}
