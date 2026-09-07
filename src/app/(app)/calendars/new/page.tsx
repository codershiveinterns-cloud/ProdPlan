import type { Metadata } from "next";

import { PageHeader } from "@/components/layout/PageHeader";
import { formatDayList, shiftNetMinutes } from "@/lib/calendar";
import { DEFAULT_NEW_SHIFT } from "@/lib/calendars/calendars";
import { requirePagePermission } from "@/lib/machines/page-guard";

import { NewCalendarForm } from "../_components/NewCalendarForm";

export const metadata: Metadata = { title: "New shift calendar" };

export default async function NewCalendarPage() {
  await requirePagePermission("machines:write");
  const s = DEFAULT_NEW_SHIFT;
  const summary = `${s.name} · ${s.startTime}–${s.endTime} · ${formatDayList(s.daysOfWeek)} · ${s.breakMinutes} min break (${shiftNetMinutes(s)} net min)`;
  return (
    <>
      <PageHeader
        title="New shift calendar"
        breadcrumbs={[{ label: "Shift calendars", href: "/calendars" }, { label: "New" }]}
        description="A calendar defines the weekly shift pattern machines run on, plus holiday and overtime exceptions."
      />
      <NewCalendarForm defaultShiftSummary={summary} />
    </>
  );
}
