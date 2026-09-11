"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { ok, parseForm, type ActionState } from "@/lib/action";
import { requirePermission } from "@/lib/auth/guards";
import {
  createCalendar,
  DEFAULT_NEW_SHIFT,
  deleteCalendar,
  renameCalendar,
  setCalendarActive,
  setDefaultCalendar,
} from "@/lib/calendars/calendars";
import { addException, deleteException, updateException } from "@/lib/calendars/exceptions";
import { addShift, deleteShift, updateShift } from "@/lib/calendars/shifts";
import { formFlag, moduleAction, runModuleAction } from "@/lib/machines/action-helpers";
import { markScheduleDirty } from "@/lib/scheduling/dirty";
import { calendarExceptionSchema, calendarSchema, renameCalendarSchema, shiftSchema } from "@/lib/validation/calendars";

function revalidateCalendar(id?: string): void {
  revalidatePath("/calendars");
  if (id) revalidatePath(`/calendars/${id}`);
  revalidatePath("/machines");
  revalidatePath("/dashboard");
}

/** /calendars/new: name only; the calendar starts with one default shift (Day 09:00–17:00 Mon–Sat, 60 min break). */
export const createCalendarAction = moduleAction(async (formData) => {
  const { session, db } = await requirePermission("machines:write");
  const input = parseForm(calendarSchema, formData);
  const c = await createCalendar(db, session, { name: input.name, shift: DEFAULT_NEW_SHIFT });
  revalidateCalendar(c.id);
  redirect(`/calendars/${c.id}?saved=created`);
});

/** Rename dialog on the editor header: `renameCalendarAction.bind(null, id)`. */
export async function renameCalendarAction(id: string, prev: ActionState, formData: FormData): Promise<ActionState> {
  return moduleAction(async (fd) => {
    const { session, db } = await requirePermission("machines:write");
    const input = parseForm(renameCalendarSchema, fd);
    const c = await renameCalendar(db, session, id, input.name);
    revalidateCalendar(c.id);
    return ok(undefined, `Calendar renamed to ${c.name}`);
  })(prev, formData);
}

/** "Set as default" (ConfirmDialog). ADMIN and PLANNER (`machines:write`; ADMIN also holds `tenant:manage`). */
export async function setDefaultCalendarAction(id: string, formData: FormData): Promise<ActionState> {
  return runModuleAction(formData, async () => {
    const { session, db } = await requirePermission("machines:write");
    await setDefaultCalendar(db, session, id);
    // docs/M2_SPEC.md §2: keep the schedule board's "out of date" banner accurate
    await markScheduleDirty(db, { all: true });
    revalidateCalendar(id);
    revalidatePath("/settings/tenant");
    return ok(undefined, "Default calendar updated. New machines will use it; existing machines keep their calendar.");
  });
}

export async function setCalendarActiveAction(id: string, active: boolean, formData: FormData): Promise<ActionState> {
  return runModuleAction(formData, async () => {
    const { session, db } = await requirePermission("machines:write");
    const c = await setCalendarActive(db, session, id, active);
    revalidateCalendar(c.id);
    return ok(undefined, `Calendar ${c.name} ${active ? "reactivated" : "deactivated"}`);
  });
}

/** Delete (ConfirmDialog). Blocked while the calendar is the default or used by machines. */
export async function deleteCalendarAction(id: string, formData: FormData): Promise<ActionState> {
  return runModuleAction(formData, async (fd) => {
    const { session, db } = await requirePermission("machines:write");
    await deleteCalendar(db, session, id);
    revalidateCalendar();
    if (formFlag(fd, "redirectToList")) redirect("/calendars?saved=deleted");
    return ok(undefined, "Calendar deleted");
  });
}

// ---- shifts -------------------------------------------------------------------------------------------------

/** ShiftDialog (add): `addShiftAction.bind(null, calendarId)`. */
export async function addShiftAction(calendarId: string, prev: ActionState, formData: FormData): Promise<ActionState> {
  return moduleAction(async (fd) => {
    const { session, db } = await requirePermission("machines:write");
    const input = parseForm(shiftSchema, fd);
    const s = await addShift(db, session, calendarId, input);
    // docs/M2_SPEC.md §2: keep the schedule board's "out of date" banner accurate
    await markScheduleDirty(db, { all: true });
    revalidateCalendar(calendarId);
    return ok(undefined, `Shift ${s.name} added`);
  })(prev, formData);
}

/** ShiftDialog (edit): `updateShiftAction.bind(null, shiftId, calendarId)`. */
export async function updateShiftAction(id: string, calendarId: string, prev: ActionState, formData: FormData): Promise<ActionState> {
  return moduleAction(async (fd) => {
    const { session, db } = await requirePermission("machines:write");
    const input = parseForm(shiftSchema, fd);
    const s = await updateShift(db, session, id, input);
    // docs/M2_SPEC.md §2: keep the schedule board's "out of date" banner accurate
    await markScheduleDirty(db, { all: true });
    revalidateCalendar(calendarId);
    return ok(undefined, `Shift ${s.name} saved`);
  })(prev, formData);
}

/** Remove a shift (ConfirmDialog); the last shift of a calendar cannot be removed. */
export async function deleteShiftAction(id: string, calendarId: string, formData: FormData): Promise<ActionState> {
  return runModuleAction(formData, async () => {
    const { session, db } = await requirePermission("machines:write");
    await deleteShift(db, session, id);
    // docs/M2_SPEC.md §2: keep the schedule board's "out of date" banner accurate
    await markScheduleDirty(db, { all: true });
    revalidateCalendar(calendarId);
    return ok(undefined, "Shift removed");
  });
}

// ---- exceptions ---------------------------------------------------------------------------------------------

/** ExceptionDialog (add): `addExceptionAction.bind(null, calendarId)`. */
export async function addExceptionAction(calendarId: string, prev: ActionState, formData: FormData): Promise<ActionState> {
  return moduleAction(async (fd) => {
    const { session, db } = await requirePermission("machines:write");
    const input = parseForm(calendarExceptionSchema, fd);
    await addException(db, session, calendarId, input);
    // docs/M2_SPEC.md §2: keep the schedule board's "out of date" banner accurate
    await markScheduleDirty(db, { all: true });
    revalidateCalendar(calendarId);
    return ok(undefined, "Exception added");
  })(prev, formData);
}

/** ExceptionDialog (edit): `updateExceptionAction.bind(null, id, calendarId)`. */
export async function updateExceptionAction(
  id: string,
  calendarId: string,
  prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return moduleAction(async (fd) => {
    const { session, db } = await requirePermission("machines:write");
    const input = parseForm(calendarExceptionSchema, fd);
    await updateException(db, session, id, input);
    // docs/M2_SPEC.md §2: keep the schedule board's "out of date" banner accurate
    await markScheduleDirty(db, { all: true });
    revalidateCalendar(calendarId);
    return ok(undefined, "Exception saved");
  })(prev, formData);
}

export async function deleteExceptionAction(id: string, calendarId: string, formData: FormData): Promise<ActionState> {
  return runModuleAction(formData, async () => {
    const { session, db } = await requirePermission("machines:write");
    await deleteException(db, session, id);
    // docs/M2_SPEC.md §2: keep the schedule board's "out of date" banner accurate
    await markScheduleDirty(db, { all: true });
    revalidateCalendar(calendarId);
    return ok(undefined, "Exception removed");
  });
}
