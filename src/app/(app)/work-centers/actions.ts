"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { ok, parseForm, type ActionState } from "@/lib/action";
import { requirePermission, safeNext } from "@/lib/auth/guards";
import { formFlag, formString, moduleAction, runModuleAction } from "@/lib/machines/action-helpers";
import {
  createWorkCenter,
  deleteWorkCenter,
  setWorkCenterActive,
  updateWorkCenter,
} from "@/lib/machines/work-centers";
import { workCenterSchema } from "@/lib/validation/work-centers";

function revalidate(): void {
  revalidatePath("/work-centers");
  revalidatePath("/machines");
  revalidatePath("/dashboard");
}

/** WorkCenterDialog (create). Redirects to `returnTo` (e.g. back to /machines/new) when given. */
export const createWorkCenterAction = moduleAction(async (formData) => {
  const { session, db } = await requirePermission("machines:write");
  const input = parseForm(workCenterSchema, formData);
  const wc = await createWorkCenter(db, session, input);
  revalidate();
  const returnTo = formString(formData, "returnTo");
  if (returnTo) redirect(safeNext(returnTo));
  return ok(undefined, `Work center ${wc.code} created`);
});

/** WorkCenterDialog (edit). Bind the id: `updateWorkCenterAction.bind(null, id)`. */
export async function updateWorkCenterAction(id: string, prev: ActionState, formData: FormData): Promise<ActionState> {
  return moduleAction(async (fd) => {
    const { session, db } = await requirePermission("machines:write");
    const input = parseForm(workCenterSchema, fd);
    const wc = await updateWorkCenter(db, session, id, input);
    revalidate();
    return ok(undefined, `Work center ${wc.code} saved`);
  })(prev, formData);
}

/** Row menu Deactivate / Reactivate (ConfirmDialog). `active` is the target state. */
export async function setWorkCenterActiveAction(id: string, active: boolean, formData: FormData): Promise<ActionState> {
  return runModuleAction(formData, async () => {
    const { session, db } = await requirePermission("machines:write");
    const wc = await setWorkCenterActive(db, session, id, active);
    revalidate();
    return ok(undefined, `Work center ${wc.code} ${active ? "reactivated" : "deactivated"}`);
  });
}

/** Row menu Delete (ConfirmDialog). Blocked with "Used by …" while machines / routing steps reference it. */
export async function deleteWorkCenterAction(id: string, formData: FormData): Promise<ActionState> {
  return runModuleAction(formData, async (fd) => {
    const { session, db } = await requirePermission("machines:write");
    await deleteWorkCenter(db, session, id);
    revalidate();
    if (formFlag(fd, "redirectToList")) redirect("/work-centers");
    return ok(undefined, "Work center deleted");
  });
}
