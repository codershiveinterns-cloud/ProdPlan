"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import type { MachineStatus } from "@/generated/prisma/enums";
import { ok, parseForm, type ActionState } from "@/lib/action";
import { requirePermission } from "@/lib/auth/guards";
import { formFlag, moduleAction, runModuleAction } from "@/lib/machines/action-helpers";
import { createDowntime, deleteDowntime, updateDowntime } from "@/lib/machines/downtime";
import { createMachine, deleteMachine, setMachineStatus, updateMachine } from "@/lib/machines/machines";
import { markScheduleDirty } from "@/lib/scheduling/dirty";
import { downtimeSchema, machineSchema, machineStatusField } from "@/lib/validation/machines";

function revalidateMachine(id?: string): void {
  revalidatePath("/machines");
  if (id) revalidatePath(`/machines/${id}`);
  revalidatePath("/work-centers");
  revalidatePath("/calendars");
  revalidatePath("/dashboard");
}

/** /machines/new form. */
export const createMachineAction = moduleAction(async (formData) => {
  const { session, db } = await requirePermission("machines:write");
  const input = parseForm(machineSchema, formData);
  const m = await createMachine(db, session, input);
  // docs/M2_SPEC.md §2: keep the schedule board's "out of date" banner accurate
  await markScheduleDirty(db, { all: true });
  revalidateMachine(m.id);
  redirect(`/machines/${m.id}?saved=created`);
});

/** /machines/[id]/edit form: `updateMachineAction.bind(null, id)`. */
export async function updateMachineAction(id: string, prev: ActionState, formData: FormData): Promise<ActionState> {
  return moduleAction(async (fd) => {
    const { session, db } = await requirePermission("machines:write");
    const input = parseForm(machineSchema, fd);
    const m = await updateMachine(db, session, id, input);
    // docs/M2_SPEC.md §2: keep the schedule board's "out of date" banner accurate
    await markScheduleDirty(db, { all: true });
    revalidateMachine(m.id);
    redirect(`/machines/${m.id}?saved=updated`);
  })(prev, formData);
}

/** Detail-page kebab: quick status change (ConfirmDialog). */
export async function setMachineStatusAction(id: string, status: MachineStatus, formData: FormData): Promise<ActionState> {
  return runModuleAction(formData, async () => {
    const { session, db } = await requirePermission("machines:write");
    const parsed = machineStatusField.parse(status);
    const m = await setMachineStatus(db, session, id, parsed);
    revalidateMachine(m.id);
    return ok(undefined, `Machine ${m.code} is now ${parsed.toLowerCase()}`);
  });
}

/** Delete (ConfirmDialog). Blocked while routing steps pin the machine; redirects to the list from the detail page. */
export async function deleteMachineAction(id: string, formData: FormData): Promise<ActionState> {
  return runModuleAction(formData, async (fd) => {
    const { session, db } = await requirePermission("machines:write");
    await deleteMachine(db, session, id);
    revalidateMachine();
    if (formFlag(fd, "redirectToList")) redirect("/machines?saved=deleted");
    return ok(undefined, "Machine deleted");
  });
}

/**
 * DowntimeDialog (create): `createDowntimeAction.bind(null, machineId)`. Overlaps return
 * `{ ok: false, error: "Overlaps with …", fieldErrors: { confirmOverlap: [...] } }` until the dialog resubmits
 * with `confirmOverlap=1` ("Save anyway").
 */
export async function createDowntimeAction(machineId: string, prev: ActionState, formData: FormData): Promise<ActionState> {
  return moduleAction(async (fd) => {
    const { session, db } = await requirePermission("downtime:write");
    fd.set("machineId", machineId);
    const input = parseForm(downtimeSchema, fd);
    await createDowntime(db, session, machineId, { ...input, confirmOverlap: formFlag(fd, "confirmOverlap") });
    // docs/M2_SPEC.md §2: keep the schedule board's "out of date" banner accurate
    await markScheduleDirty(db, { all: true });
    revalidateMachine(machineId);
    return ok(undefined, "Downtime window added");
  })(prev, formData);
}

/** DowntimeDialog (edit): `updateDowntimeAction.bind(null, id, machineId)`. */
export async function updateDowntimeAction(
  id: string,
  machineId: string,
  prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return moduleAction(async (fd) => {
    const { session, db } = await requirePermission("downtime:write");
    fd.set("machineId", machineId);
    const input = parseForm(downtimeSchema, fd);
    await updateDowntime(db, session, id, { ...input, confirmOverlap: formFlag(fd, "confirmOverlap") });
    // docs/M2_SPEC.md §2: keep the schedule board's "out of date" banner accurate
    await markScheduleDirty(db, { all: true });
    revalidateMachine(machineId);
    return ok(undefined, "Downtime window saved");
  })(prev, formData);
}

/** Delete a downtime window (ConfirmDialog). */
export async function deleteDowntimeAction(id: string, machineId: string, formData: FormData): Promise<ActionState> {
  return runModuleAction(formData, async () => {
    const { session, db } = await requirePermission("downtime:write");
    await deleteDowntime(db, session, id);
    // docs/M2_SPEC.md §2: keep the schedule board's "out of date" banner accurate
    await markScheduleDirty(db, { all: true });
    revalidateMachine(machineId);
    return ok(undefined, "Downtime window removed");
  });
}
