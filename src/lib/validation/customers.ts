/** Customers (docs/M1_SPEC.md §6.7). Names are trimmed with internal whitespace collapsed. */
import { z } from "zod";
import { normalizeCustomerName } from "@/lib/customers-normalize";
import { optionalCheckbox, optionalEmailField, optionalText, text } from "./common";

export const CUSTOMER_NAME_MAX = 120;

export const customerNameField = text("Customer name", { max: CUSTOMER_NAME_MAX }).transform((s) =>
  normalizeCustomerName(s),
);

export const customerSchema = z.object({
  name: customerNameField,
  code: optionalText("Code", { max: 32 }),
  email: optionalEmailField,
  phone: optionalText("Phone", { max: 32 }),
  notes: optionalText("Notes", { max: 2000, multiline: true }),
  isActive: optionalCheckbox(),
});

export type CustomerInput = z.infer<typeof customerSchema>;
