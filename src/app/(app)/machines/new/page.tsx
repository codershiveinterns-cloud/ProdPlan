import type { Metadata } from "next";

import { PageHeader } from "@/components/layout/PageHeader";
import { calendarOptions } from "@/lib/calendars/calendars";
import { requirePagePermission } from "@/lib/machines/page-guard";
import { workCenterOptions } from "@/lib/machines/work-centers";

import { MachineForm } from "../_components/MachineForm";

export const metadata: Metadata = { title: "New machine" };

export default async function NewMachinePage() {
  const { session, db } = await requirePagePermission("machines:write");
  const [workCenters, calendars] = await Promise.all([workCenterOptions(db), calendarOptions(db)]);
  return (
    <>
      <PageHeader
        title="New machine"
        breadcrumbs={[{ label: "Machines", href: "/machines" }, { label: "New machine" }]}
        description="Capacity is time-based: shift minutes from the calendar × efficiency, minus downtime."
      />
      <MachineForm
        workCenters={workCenters}
        calendars={calendars}
        defaultCalendarId={session.tenant.defaultCalendarId}
        cancelHref="/machines"
      />
    </>
  );
}
