"use server";

/**
 * Materials & inventory Server Actions (docs/M1_SPEC.md §3, §6.4). Every action re-checks its permission with
 * `requirePermission()`; mutations run in one transaction with their audit row (src/lib/materials/service.ts,
 * src/lib/stock.ts). Success = redirect with a `?flash=` toast, or `{ ok:true, message }` for dialogs.
 */
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { fieldError, mapActionError, ok, parseForm, withAction, type ActionState } from "@/lib/action";
import { auditContext } from "@/lib/audit";
import { requirePermission } from "@/lib/auth/guards";
import { formatQty } from "@/lib/format";
import { movementTypeLabel } from "@/lib/materials/movement-types";
import {
  createMaterial,
  deleteMaterial,
  MaterialCodeTakenError,
  setMaterialActive,
  updateMaterial,
} from "@/lib/materials/service";
import { recordStockMovement } from "@/lib/stock";
import { materialSchema, stockMovementSchema } from "@/lib/validation/materials";

function revalidateMaterial(materialId?: string): void {
  revalidatePath("/materials");
  if (materialId) revalidatePath(`/materials/${materialId}`);
}

/** Runs a closure with the same error mapping as `withAction()` (for actions bound with extra arguments). */
async function guarded(fn: () => Promise<ActionState>): Promise<ActionState> {
  try {
    return await fn();
  } catch (err) {
    return mapActionError(err);
  }
}

export const createMaterialAction = withAction(async (formData: FormData): Promise<ActionState> => {
  const { session, db } = await requirePermission("materials:write");
  const input = parseForm(materialSchema, formData);
  const ctx = await auditContext(session);
  let materialId: string;
  try {
    materialId = (await createMaterial(db, session, ctx, input)).id;
  } catch (err) {
    if (err instanceof MaterialCodeTakenError) return fieldError("code", err.message);
    throw err;
  }
  revalidateMaterial(materialId);
  redirect(`/materials/${materialId}?flash=created`);
});

export async function updateMaterialAction(
  materialId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return guarded(async () => {
    const { session, db } = await requirePermission("materials:write");
    const input = parseForm(materialSchema, formData);
    const ctx = await auditContext(session);
    try {
      await updateMaterial(db, session, ctx, materialId, input);
    } catch (err) {
      if (err instanceof MaterialCodeTakenError) return fieldError("code", err.message);
      throw err;
    }
    revalidateMaterial(materialId);
    redirect(`/materials/${materialId}?flash=updated`);
  });
}

/** Deactivate / reactivate. Used by ConfirmDialog (`action.bind(null, id, isActive)`). */
export async function setMaterialActiveAction(
  materialId: string,
  isActive: boolean,
  _formData: FormData,
): Promise<ActionState> {
  void _formData; // ConfirmDialog posts its (empty) FormData positionally after the bound arguments.
  return guarded(async () => {
    const { session, db } = await requirePermission("materials:write");
    const ctx = await auditContext(session);
    const material = await setMaterialActive(db, session, ctx, materialId, isActive);
    revalidateMaterial(materialId);
    return ok(undefined, `${material.code} ${isActive ? "reactivated" : "deactivated"}`);
  });
}

/** Hard delete (blocked server-side when referenced). Redirects to the list on success. */
export async function deleteMaterialAction(materialId: string, _formData: FormData): Promise<ActionState> {
  void _formData;
  return guarded(async () => {
    const { session, db } = await requirePermission("materials:write");
    const ctx = await auditContext(session);
    await deleteMaterial(db, session, ctx, materialId);
    revalidateMaterial(materialId);
    redirect("/materials?flash=deleted");
  });
}

/**
 * Record a stock movement from the MovementDialog. `stock:move` gates the action; `applyStockMovement()` demands
 * `stock:adjust` for ADJUSTMENT on top of that.
 */
export const recordMovementAction = withAction(async (formData: FormData): Promise<ActionState> => {
  const { session, db } = await requirePermission("stock:move");
  const input = parseForm(stockMovementSchema, formData);
  const ctx = await auditContext(session);
  const result = await recordStockMovement(db, session, ctx, input);
  revalidateMaterial(input.materialId);
  return ok(
    undefined,
    `${movementTypeLabel(input.type)} recorded — ${formatQty(result.balanceAfter, result.material.unit)} on hand`,
  );
});
