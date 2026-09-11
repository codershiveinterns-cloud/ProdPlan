"use server";

/**
 * Floor flow Server Actions (docs/M2_SPEC.md §4). Every action requires `operations:status`, validates its input
 * with zod, and applies the transition inside a single `db.$transaction` via `applyOperationTransition` (which
 * already audits, rolls the order up, re-assesses delivery risk and marks the schedule dirty when needed — no
 * extra work here). A thrown `DomainError` (illegal transition, previous step not done, reason required, …) is
 * mapped by `withAction()`/`mapActionError()` to a form error instead of a 500.
 */
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { ok, parseForm, withAction } from "@/lib/action";
import { auditContext } from "@/lib/audit";
import { requirePermission } from "@/lib/auth/guards";
import { applyOperationTransition } from "@/lib/scheduling/operation-status";
import { idField, numberField, optionalText, text } from "@/lib/validation/common";

function revalidateFloor(orderId?: string): void {
  revalidatePath("/floor");
  revalidatePath("/orders");
  revalidatePath("/dashboard");
  if (orderId) revalidatePath(`/orders/${orderId}`);
}

const startSchema = z.object({ entryId: idField("operation") });
const resumeSchema = z.object({ entryId: idField("operation") });
const pauseSchema = z.object({ entryId: idField("operation"), reason: text("Reason", { max: 500, multiline: true }) });
const completeSchema = z.object({
  entryId: idField("operation"),
  quantityDone: numberField("Quantity done", { min: 0, decimals: 3 }),
  note: optionalText("Note", { max: 500, multiline: true }),
});

export const startOperationAction = withAction(async (formData) => {
  const { session, db } = await requirePermission("operations:status");
  const input = parseForm(startSchema, formData);
  const ctx = await auditContext(session);
  const result = await db.$transaction((tx) =>
    applyOperationTransition(tx, session, ctx, { entryId: input.entryId, to: "IN_PROGRESS" }),
  );
  revalidateFloor(result.orderId);
  return ok(undefined, result.summary);
});

export const resumeOperationAction = withAction(async (formData) => {
  const { session, db } = await requirePermission("operations:status");
  const input = parseForm(resumeSchema, formData);
  const ctx = await auditContext(session);
  const result = await db.$transaction((tx) =>
    applyOperationTransition(tx, session, ctx, { entryId: input.entryId, to: "IN_PROGRESS" }),
  );
  revalidateFloor(result.orderId);
  return ok(undefined, result.summary);
});

export const pauseOperationAction = withAction(async (formData) => {
  const { session, db } = await requirePermission("operations:status");
  const input = parseForm(pauseSchema, formData);
  const ctx = await auditContext(session);
  const result = await db.$transaction((tx) =>
    applyOperationTransition(tx, session, ctx, { entryId: input.entryId, to: "ON_HOLD", reason: input.reason }),
  );
  revalidateFloor(result.orderId);
  return ok(undefined, result.summary);
});

export const completeOperationAction = withAction(async (formData) => {
  const { session, db } = await requirePermission("operations:status");
  const input = parseForm(completeSchema, formData);
  const ctx = await auditContext(session);
  const result = await db.$transaction((tx) =>
    applyOperationTransition(tx, session, ctx, {
      entryId: input.entryId,
      to: "COMPLETED",
      quantityDone: input.quantityDone,
      note: input.note ?? null,
    }),
  );
  revalidateFloor(result.orderId);
  return ok(undefined, result.summary);
});
