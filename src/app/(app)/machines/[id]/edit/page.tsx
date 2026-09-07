import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/layout/PageHeader";
import { calendarOptions } from "@/lib/calendars/calendars";
import { requirePagePermission } from "@/lib/machines/page-guard";
import { workCenterOptions } from "@/lib/machines/work-centers";
import { toPlain } from "@/lib/serialize";

import { MachineForm } from "../../_components/MachineForm";

export const metadata: Metadata = { title: "Edit machine" };

export default async function EditMachinePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { session, db } = await requirePagePermission("machines:write");
  const machine = await db.machine.findUnique({ where: { id } });
  if (!machine) notFound();
  const [workCenters, calendars] = await Promise.all([
    workCenterOptions(db, machine.workCenterId),
    calendarOptions(db, machine.calendarId),
  ]);
  const plain = toPlain(machine);
  return (
    <>
      <PageHeader
        title={`Edit ${machine.code}`}
        description={machine.name}
        breadcrumbs={[
          { label: "Machines", href: "/machines" },
          { label: machine.code, href: `/machines/${machine.id}` },
          { label: "Edit" },
        ]}
      />
      <MachineForm
        machine={{
          id: plain.id,
          workCenterId: plain.workCenterId,
          calendarId: plain.calendarId,
          code: plain.code,
          name: plain.name,
          status: plain.status,
          efficiencyPercent: plain.efficiencyPercent,
          ratedCapacityPerShift: plain.ratedCapacityPerShift,
          capacityUnit: plain.capacityUnit,
          notes: plain.notes,
        }}
        workCenters={workCenters}
        calendars={calendars}
        defaultCalendarId={session.tenant.defaultCalendarId}
        cancelHref={`/machines/${machine.id}`}
      />
    </>
  );
}
