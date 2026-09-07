/**
 * Edit-form schema for orders. Create uses `createOrderSchema(today)` from `@/lib/validation/orders` unchanged;
 * edit differs in two ways: locked fields (per `editableFields(status)`) are filled in from the stored order before
 * validation, and the order number keeps its current value when left blank — an automatic `SO-000123` must not be
 * re-validated against the "reserved pattern" rule when it is simply unchanged.
 */
import { z } from "zod";
import { normalizeOrderNumber, orderNumberSchema } from "@/lib/orders/numbers";
import { compareDateOnly, isIsoDate } from "@/lib/dates";
import { emptyToUndefined } from "@/lib/validation/common";
import { orderBaseSchema, START_AFTER_DUE_MESSAGE } from "@/lib/validation/orders";

const { customer, customerPoRef, productId, quantity, dueDate, earliestStartDate, priority, notes } =
  orderBaseSchema.shape;

/** Builds the edit schema for a specific order (its current number decides whether `orderNumber` changed). */
export function editOrderFormSchema(currentOrderNumber: string) {
  const current = normalizeOrderNumber(currentOrderNumber);
  return z
    .object({
      customer,
      customerPoRef,
      productId,
      quantity,
      dueDate,
      earliestStartDate,
      priority,
      notes,
      /** Blank → keep the current number; a changed value must pass the user-provided-number rules. */
      orderNumber: z.preprocess(
        emptyToUndefined,
        z
          .string()
          .transform((s) => normalizeOrderNumber(s))
          .superRefine((value, ctx) => {
            if (value === current) return;
            const parsed = orderNumberSchema.safeParse(value);
            if (!parsed.success) {
              for (const issue of parsed.error.issues) ctx.addIssue({ code: "custom", message: issue.message });
            }
          })
          .optional(),
      ),
    })
    .refine(
      (d) =>
        d.earliestStartDate === undefined ||
        !isIsoDate(d.dueDate) ||
        !isIsoDate(d.earliestStartDate) ||
        compareDateOnly(d.earliestStartDate, d.dueDate) <= 0,
      { error: START_AFTER_DUE_MESSAGE, path: ["earliestStartDate"] },
    );
}

export type EditOrderFormInput = z.infer<ReturnType<typeof editOrderFormSchema>>;
