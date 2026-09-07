/** Products, BOM items and routing operations (docs/M1_SPEC.md §4, §6.5). */
import { z } from "zod";
import {
  idField,
  intField,
  numberField,
  optionalCheckbox,
  optionalIdField,
  optionalText,
  quantityField,
  text,
  unitField,
} from "./common";

export const productSchema = z.object({
  sku: text("SKU", { max: 64 }),
  name: text("Name", { max: 120 }),
  description: optionalText("Description", { max: 2000, multiline: true }),
  unit: unitField,
  isActive: optionalCheckbox(),
});

export type ProductInput = z.infer<typeof productSchema>;

export const bomItemSchema = z.object({
  productId: idField("product"),
  materialId: idField("material"),
  quantityPerUnit: quantityField("Quantity per unit"),
  scrapPercent: numberField("Scrap %", {
    min: 0,
    max: 100,
    decimals: 2,
    defaultValue: 0,
    messages: { min: "Scrap % must be between 0 and 100", max: "Scrap % must be between 0 and 100" },
  }),
  note: optionalText("Note", { max: 500 }),
});

export type BomItemInput = z.infer<typeof bomItemSchema>;

export const productOperationSchema = z.object({
  productId: idField("product"),
  workCenterId: idField("work center"),
  /** Fixed machine (optional; blank = any machine in the work center). Must belong to the work center — checked in the action. */
  machineId: optionalIdField("machine"),
  setupMinutes: intField("Setup minutes", { min: 0, max: 100_000, defaultValue: 0 }),
  runMinutesPerUnit: numberField("Run minutes per unit", { min: 0, max: 100_000, decimals: 3 }),
});

export type ProductOperationInput = z.infer<typeof productOperationSchema>;

export const moveOperationSchema = z.object({
  productId: idField("product"),
  operationId: idField("operation"),
  direction: z.enum(["up", "down"], { error: "Invalid direction" }),
});

export type MoveOperationInput = z.infer<typeof moveOperationSchema>;
