"use server";

/**
 * Server Actions for products, BOM and routing (docs/M1_SPEC.md §6.5). Each action authorises itself with
 * `requirePermission("products:write")`, validates with the zod schemas, delegates to src/lib/products/mutations.ts
 * (which audits inside the same transaction) and revalidates the affected pages.
 */
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { fieldError, ok, parseForm, withAction, type ActionState, type ServerAction } from "@/lib/action";
import { requirePermission, safeNext } from "@/lib/auth/guards";
import { ProductFieldError } from "@/lib/products/errors";
import {
  addBomItem,
  addOperation,
  createProduct,
  deleteProduct,
  moveOperation,
  removeBomItem,
  removeOperation,
  setProductActive,
  updateBomItem,
  updateOperation,
  updateProduct,
} from "@/lib/products/mutations";
import { bomItemUpdateSchema, productOperationUpdateSchema, productUpdateSchema } from "@/lib/products/schemas";
import { markScheduleDirty } from "@/lib/scheduling/dirty";
import { bomItemSchema, moveOperationSchema, productOperationSchema, productSchema } from "@/lib/validation/products";

/** `withAction()` plus the module's field-level domain errors → `fieldErrors`. */
function withProductAction<T = unknown>(fn: (formData: FormData) => Promise<ActionState<T>>): ServerAction<T> {
  return withAction<T>(async (formData) => {
    try {
      return await fn(formData);
    } catch (err) {
      if (err instanceof ProductFieldError) return fieldError<T>(err.field, err.message);
      throw err;
    }
  });
}

function revalidateProduct(productId: string): void {
  revalidatePath("/products");
  revalidatePath(`/products/${productId}`);
  revalidatePath(`/products/${productId}/edit`);
}

/** Optional `return` field (from "No products yet — Create one" links): honoured only when it is a safe local path. */
function returnPath(formData: FormData): string | null {
  const raw = formData.get("return");
  if (typeof raw !== "string" || raw === "") return null;
  const safe = safeNext(raw);
  return safe === "/dashboard" ? null : safe;
}

// ---------------------------------------------------------------------------------------------------------------
// Products
// ---------------------------------------------------------------------------------------------------------------

export const createProductAction = withProductAction(async (formData) => {
  const { session, db } = await requirePermission("products:write");
  const input = parseForm(productSchema, formData);
  const product = await createProduct(db, session, input);
  revalidatePath("/products");
  redirect(returnPath(formData) ?? `/products/${product.id}?flash=created`);
});

export const updateProductAction = withProductAction(async (formData) => {
  const { session, db } = await requirePermission("products:write");
  const { productId, ...input } = parseForm(productUpdateSchema, formData);
  const product = await updateProduct(db, session, productId, input);
  revalidateProduct(product.id);
  redirect(`/products/${product.id}?flash=saved`);
});

/** Bound as `deleteProductAction.bind(null, id)` for `ConfirmDialog`. Redirects to the list on success. */
export async function deleteProductAction(productId: string, formData: FormData): Promise<ActionState> {
  return withProductAction(async () => {
    const { session, db } = await requirePermission("products:write");
    await deleteProduct(db, session, productId);
    revalidatePath("/products");
    redirect("/products?flash=deleted");
  })(null, formData);
}

/** Bound as `setProductActiveAction.bind(null, id, false)` (Deactivate) / `(…, true)` (Reactivate). */
export async function setProductActiveAction(productId: string, isActive: boolean, formData: FormData): Promise<ActionState> {
  return withProductAction(async () => {
    const { session, db } = await requirePermission("products:write");
    const product = await setProductActive(db, session, productId, isActive);
    revalidateProduct(product.id);
    return ok(undefined, isActive ? `Product ${product.sku} reactivated` : `Product ${product.sku} deactivated`);
  })(null, formData);
}

// ---------------------------------------------------------------------------------------------------------------
// BOM
// ---------------------------------------------------------------------------------------------------------------

export const addBomItemAction = withProductAction(async (formData) => {
  const { session, db } = await requirePermission("products:write");
  const input = parseForm(bomItemSchema, formData);
  await addBomItem(db, session, input);
  // docs/M2_SPEC.md §2: keep the schedule board's "out of date" banner accurate
  await markScheduleDirty(db, { all: true });
  revalidateProduct(input.productId);
  return ok(undefined, "Material added to the BOM");
});

export const updateBomItemAction = withProductAction(async (formData) => {
  const { session, db } = await requirePermission("products:write");
  const { bomItemId, ...input } = parseForm(bomItemUpdateSchema, formData);
  await updateBomItem(db, session, bomItemId, input);
  // docs/M2_SPEC.md §2: keep the schedule board's "out of date" banner accurate
  await markScheduleDirty(db, { all: true });
  revalidateProduct(input.productId);
  return ok(undefined, "BOM line saved");
});

/** Bound as `removeBomItemAction.bind(null, productId, bomItemId)` for `ConfirmDialog`. */
export async function removeBomItemAction(productId: string, bomItemId: string, formData: FormData): Promise<ActionState> {
  return withProductAction(async () => {
    const { session, db } = await requirePermission("products:write");
    await removeBomItem(db, session, bomItemId);
    // docs/M2_SPEC.md §2: keep the schedule board's "out of date" banner accurate
    await markScheduleDirty(db, { all: true });
    revalidateProduct(productId);
    return ok(undefined, "Material removed from the BOM");
  })(null, formData);
}

// ---------------------------------------------------------------------------------------------------------------
// Routing
// ---------------------------------------------------------------------------------------------------------------

export const addOperationAction = withProductAction(async (formData) => {
  const { session, db } = await requirePermission("products:write");
  const input = parseForm(productOperationSchema, formData);
  await addOperation(db, session, input);
  // docs/M2_SPEC.md §2: keep the schedule board's "out of date" banner accurate
  await markScheduleDirty(db, { all: true });
  revalidateProduct(input.productId);
  return ok(undefined, "Routing step added");
});

export const updateOperationAction = withProductAction(async (formData) => {
  const { session, db } = await requirePermission("products:write");
  const { operationId, ...input } = parseForm(productOperationUpdateSchema, formData);
  await updateOperation(db, session, operationId, input);
  // docs/M2_SPEC.md §2: keep the schedule board's "out of date" banner accurate
  await markScheduleDirty(db, { all: true });
  revalidateProduct(input.productId);
  return ok(undefined, "Routing step saved");
});

/** Bound as `removeOperationAction.bind(null, productId, operationId)` for `ConfirmDialog`. */
export async function removeOperationAction(productId: string, operationId: string, formData: FormData): Promise<ActionState> {
  return withProductAction(async () => {
    const { session, db } = await requirePermission("products:write");
    await removeOperation(db, session, operationId);
    // docs/M2_SPEC.md §2: keep the schedule board's "out of date" banner accurate
    await markScheduleDirty(db, { all: true });
    revalidateProduct(productId);
    return ok(undefined, "Routing step removed");
  })(null, formData);
}

/** Up/Down buttons post `productId`, `operationId`, `direction`. */
export const moveOperationAction = withProductAction(async (formData) => {
  const { session, db } = await requirePermission("products:write");
  const input = parseForm(moveOperationSchema, formData);
  const result = await moveOperation(db, session, input);
  if (result.moved) {
    // docs/M2_SPEC.md §2: keep the schedule board's "out of date" banner accurate
    await markScheduleDirty(db, { all: true });
    revalidateProduct(input.productId);
  }
  return ok(result);
});
