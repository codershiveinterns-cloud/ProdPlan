"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { fail, ok, parseForm, withAction } from "@/lib/action";
import { requirePermission } from "@/lib/auth/guards";
import { todayInTz } from "@/lib/dates";
import { NotFoundError } from "@/lib/errors";
import { editOrderFormSchema } from "@/lib/orders/forms";
import { commitImport, discardImport, previewImport } from "@/lib/orders/import";
import { changeOrderStatus, createOrder, updateOrder, type OrderPatch } from "@/lib/orders/service";
import { editableFields, isTerminal, STATUS_LABELS } from "@/lib/orders/status";
import { markScheduleDirty } from "@/lib/scheduling/dirty";
import { idField } from "@/lib/validation/common";
import { createOrderSchema, editOrderNotesSchema, statusChangeSchema } from "@/lib/validation/orders";

function revalidateOrders(orderId?: string): void {
  revalidatePath("/orders");
  revalidatePath("/dashboard");
  revalidatePath("/customers");
  if (orderId) revalidatePath(`/orders/${orderId}`);
}

export const createOrderAction = withAction(async (formData) => {
  const { session, db } = await requirePermission("orders:write");
  const input = parseForm(createOrderSchema(todayInTz(session.tenant.timezone)), formData);
  const order = await createOrder(db, session, input);
  // docs/M2_SPEC.md §2: keep the schedule board's "out of date" banner accurate
  await markScheduleDirty(db, { orderIds: [order.id] });
  revalidateOrders(order.id);
  redirect(`/orders/${order.id}?flash=created`);
});

export const updateOrderAction = withAction(async (formData) => {
  const { session, db } = await requirePermission("orders:write");
  const orderId = idField("order").parse(formData.get("orderId"));
  const current = await db.order.findUnique({
    where: { id: orderId },
    select: { status: true, customerId: true, productId: true, orderNumber: true },
  });
  if (!current) throw new NotFoundError("Order not found.");

  let patch: OrderPatch;
  if (isTerminal(current.status)) {
    const input = parseForm(editOrderNotesSchema, formData);
    patch = { notes: input.notes ?? null };
  } else {
    // Locked fields are rendered read-only (not posted); fill them from the stored order before validating.
    const editable = editableFields(current.status);
    if (!editable.has("customerId")) formData.set("customer", current.customerId);
    if (!editable.has("productId")) formData.set("productId", current.productId);
    if (!editable.has("orderNumber")) formData.set("orderNumber", current.orderNumber);
    const input = parseForm(editOrderFormSchema(current.orderNumber), formData);
    patch = {
      customer: input.customer,
      customerPoRef: input.customerPoRef ?? null,
      productId: input.productId,
      quantity: input.quantity,
      priority: input.priority,
      dueDate: input.dueDate,
      earliestStartDate: input.earliestStartDate ?? null,
      orderNumber: input.orderNumber,
      notes: input.notes ?? null,
    };
  }
  await updateOrder(db, session, orderId, patch);
  // docs/M2_SPEC.md §2: keep the schedule board's "out of date" banner accurate
  await markScheduleDirty(db, { orderIds: [orderId] });
  revalidateOrders(orderId);
  redirect(`/orders/${orderId}?flash=updated`);
});

export const changeStatusAction = withAction(async (formData) => {
  const { session, db } = await requirePermission("orders:status");
  const input = parseForm(statusChangeSchema, formData);
  const order = await changeOrderStatus(db, session, input);
  // docs/M2_SPEC.md §2: keep the schedule board's "out of date" banner accurate
  await markScheduleDirty(db, { orderIds: [order.id] });
  revalidateOrders(order.id);
  return ok(undefined, `Order ${order.orderNumber} is now ${STATUS_LABELS[order.status].toLowerCase()}`);
});

export const previewImportAction = withAction(async (formData) => {
  const { session, db } = await requirePermission("orders:write");
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0 || !file.name) {
    return fail("Choose a CSV file to upload", { file: ["Choose a CSV file"] });
  }
  const preview = await previewImport(db, session, file);
  redirect(`/orders/import?batch=${encodeURIComponent(preview.batchId)}`);
});

export const commitImportAction = withAction(async (formData) => {
  const { session, db } = await requirePermission("orders:write");
  const batchId = idField("import").parse(formData.get("batchId"));
  const result = await commitImport(db, session, batchId);
  // docs/M2_SPEC.md §2: keep the schedule board's "out of date" banner accurate
  if (result.orderNumbers.length > 0) {
    const created = await db.order.findMany({ where: { orderNumber: { in: result.orderNumbers } }, select: { id: true } });
    await markScheduleDirty(db, { orderIds: created.map((o) => o.id) });
  }
  revalidateOrders();
  redirect(`/orders/import?batch=${encodeURIComponent(batchId)}`);
});

export const discardImportAction = withAction(async (formData) => {
  const { session, db } = await requirePermission("orders:write");
  const batchId = idField("import").parse(formData.get("batchId"));
  await discardImport(db, session, batchId);
  redirect("/orders/import?flash=discarded");
});
