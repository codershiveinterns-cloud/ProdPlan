/** Orders (docs/M1_SPEC.md §4 "Orders", §6.1): create, edit, status change. */
import { z } from "zod";
import { OrderPriority, OrderStatus } from "@/generated/prisma/enums";
import { normalizeCustomerName } from "@/lib/customers-normalize";
import { compareDateOnly } from "@/lib/dates";
import { optionalOrderNumberSchema } from "@/lib/orders/numbers";
import { transitionRequiresReason } from "@/lib/orders/status";
import { CUSTOMER_NAME_MAX } from "./customers";
import {
  enumField,
  enumFieldWithDefault,
  hasControlChars,
  idField,
  isoDateField,
  optionalIsoDateField,
  optionalText,
  quantityField,
} from "./common";

export const DUE_DATE_PAST_MESSAGE = "Due date cannot be in the past";
export const START_AFTER_DUE_MESSAGE = "Start date must be on or before the due date";
export const CUSTOMER_REQUIRED_MESSAGE = "Select or create a customer";
export const HOLD_REASON_MESSAGE = "Give a reason for putting the order on hold";

export const NEW_CUSTOMER_PREFIX = "new:";

/** Combobox hidden value: an existing customer id, or `new:<typed name>` when the user picked "Create X". */
export type CustomerRef = { id: string; create?: undefined } | { create: string; id?: undefined };

export const customerRefSchema = z
  .string({ error: CUSTOMER_REQUIRED_MESSAGE })
  .trim()
  .min(1, { error: CUSTOMER_REQUIRED_MESSAGE })
  .max(NEW_CUSTOMER_PREFIX.length + CUSTOMER_NAME_MAX + 200, {
    error: `Customer name must be at most ${CUSTOMER_NAME_MAX} characters`,
  })
  .transform((v): CustomerRef =>
    v.startsWith(NEW_CUSTOMER_PREFIX) ? { create: normalizeCustomerName(v.slice(NEW_CUSTOMER_PREFIX.length)) } : { id: v },
  )
  .refine((r) => r.create === undefined || (r.create.length >= 1 && r.create.length <= CUSTOMER_NAME_MAX), {
    error: `Customer name must be 1–${CUSTOMER_NAME_MAX} characters`,
  })
  .refine((r) => !hasControlChars(r.create ?? r.id ?? ""), { error: "Customer contains invalid characters" });

/** Blank → NORMAL. */
export const priorityField = enumFieldWithDefault(OrderPriority, "Select a priority", "NORMAL");

export const orderStatusField = enumField(OrderStatus, "Select a status");

/** Fields shared by create and edit (edit may pass a past due date; the order is then overdue). */
export const orderBaseSchema = z.object({
  customer: customerRefSchema,
  customerPoRef: optionalText("Customer PO ref", { max: 64 }),
  productId: idField("product"),
  quantity: quantityField("Quantity"),
  dueDate: isoDateField("Due date"),
  earliestStartDate: optionalIsoDateField("Start not before"),
  priority: priorityField,
  /** Blank = automatic `SO-000124`. */
  orderNumber: optionalOrderNumberSchema,
  notes: optionalText("Notes", { max: 2000, multiline: true }),
});

export type OrderInput = z.infer<typeof orderBaseSchema>;

function startNotAfterDue(d: { dueDate: string; earliestStartDate?: string }): boolean {
  return d.earliestStartDate === undefined || compareDateOnly(d.earliestStartDate, d.dueDate) <= 0;
}

/** Create: `dueDate ≥ today` (today = `todayInTz(tenant.timezone)`) and `earliestStartDate ≤ dueDate`. */
export function createOrderSchema(today: string) {
  return orderBaseSchema
    .refine((d) => compareDateOnly(d.dueDate, today) >= 0, { error: DUE_DATE_PAST_MESSAGE, path: ["dueDate"] })
    .refine(startNotAfterDue, { error: START_AFTER_DUE_MESSAGE, path: ["earliestStartDate"] });
}

export type CreateOrderInput = z.infer<ReturnType<typeof createOrderSchema>>;

/** Edit: past due dates allowed; lock rules (`editableFields(status)`) are enforced by the action. */
export const editOrderSchema = orderBaseSchema
  .extend({ orderId: idField("order") })
  .refine(startNotAfterDue, { error: START_AFTER_DUE_MESSAGE, path: ["earliestStartDate"] });

export type EditOrderInput = z.infer<typeof editOrderSchema>;

/** Terminal orders: only notes are editable. */
export const editOrderNotesSchema = z.object({
  orderId: idField("order"),
  notes: optionalText("Notes", { max: 2000, multiline: true }),
});

export type EditOrderNotesInput = z.infer<typeof editOrderNotesSchema>;

export const statusChangeSchema = z
  .object({
    orderId: idField("order"),
    status: orderStatusField,
    reason: optionalText("Reason", { max: 500 }),
  })
  .refine((d) => !transitionRequiresReason(d.status) || d.reason !== undefined, {
    error: HOLD_REASON_MESSAGE,
    path: ["reason"],
  });

export type StatusChangeInput = z.infer<typeof statusChangeSchema>;
