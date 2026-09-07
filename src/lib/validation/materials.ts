/** Materials master and stock movements (docs/M1_SPEC.md §4 "Stock", §6.4). */
import { z } from "zod";
import { StockMovementType } from "@/generated/prisma/enums";
import { round3 } from "@/lib/bom";
import {
  enumField,
  idField,
  intField,
  numberField,
  optionalCheckbox,
  optionalNumberField,
  optionalText,
  text,
  unitField,
} from "./common";

export const materialSchema = z.object({
  code: text("Code", { max: 64 }),
  name: text("Name", { max: 120 }),
  unit: unitField,
  reorderThreshold: numberField("Reorder threshold", { min: 0, decimals: 3, defaultValue: 0 }),
  reorderLeadTimeDays: intField("Reorder lead time", {
    min: 0,
    max: 3650,
    defaultValue: 0,
    messages: { min: "Lead time must be 0 or more days", max: "Lead time must be at most 3650 days" },
  }),
  unitCost: optionalNumberField("Unit cost", { min: 0, decimals: 2 }),
  supplier: optionalText("Supplier", { max: 120 }),
  isActive: optionalCheckbox(),
});

export type MaterialInput = z.infer<typeof materialSchema>;

export const stockMovementTypeField = enumField(StockMovementType, "Select a movement type");

export const QUANTITY_MESSAGE = "Enter a quantity greater than 0";
export const NEW_STOCK_MESSAGE = "Enter the counted stock on hand (0 or more)";

/**
 * The UI never asks for signed numbers: Type + positive Quantity, or "New stock on hand" (≥ 0) for ADJUSTMENT.
 * The server computes the signed delta (`movementDelta`).
 */
export const stockMovementSchema = z
  .object({
    materialId: idField("material"),
    type: stockMovementTypeField,
    quantity: optionalNumberField("Quantity", {
      positive: true,
      decimals: 3,
      messages: { number: QUANTITY_MESSAGE, positive: QUANTITY_MESSAGE },
    }),
    newStock: optionalNumberField("New stock on hand", {
      min: 0,
      decimals: 3,
      messages: { number: NEW_STOCK_MESSAGE, min: NEW_STOCK_MESSAGE },
    }),
    reference: optionalText("Reference", { max: 64 }),
    note: optionalText("Note", { max: 500 }),
  })
  .superRefine((d, ctx) => {
    if (d.type === "ADJUSTMENT") {
      if (d.newStock === undefined) {
        ctx.addIssue({ code: "custom", path: ["newStock"], message: NEW_STOCK_MESSAGE });
      }
    } else if (d.quantity === undefined) {
      ctx.addIssue({ code: "custom", path: ["quantity"], message: QUANTITY_MESSAGE });
    }
  });

export type StockMovementInput = z.infer<typeof stockMovementSchema>;

/**
 * Signed delta to apply to `Material.stockOnHand`: RECEIPT/RETURN = +qty, ISSUE = −qty,
 * ADJUSTMENT = newStock − currentOnHand (3 dp).
 */
export function movementDelta(
  input: Pick<StockMovementInput, "type" | "quantity" | "newStock">,
  currentOnHand: number | string | { toString(): string },
): number {
  const current = Number(String(currentOnHand));
  switch (input.type) {
    case "RECEIPT":
    case "RETURN":
      return round3(input.quantity ?? 0);
    case "ISSUE":
      return round3(-(input.quantity ?? 0));
    case "ADJUSTMENT":
      return round3((input.newStock ?? 0) - current);
  }
}
