/**
 * Products module schemas that extend the shared ones in src/lib/validation/products.ts with the ids that
 * edit/remove forms carry as hidden inputs. The shared schemas stay the single source of field rules.
 */
import { z } from "zod";
import { idField } from "@/lib/validation/common";
import { bomItemSchema, productOperationSchema, productSchema } from "@/lib/validation/products";

export const productUpdateSchema = productSchema.extend({
  productId: idField("product"),
});
export type ProductUpdateInput = z.infer<typeof productUpdateSchema>;

export const bomItemUpdateSchema = bomItemSchema.extend({
  bomItemId: idField("BOM item"),
});
export type BomItemUpdateInput = z.infer<typeof bomItemUpdateSchema>;

export const productOperationUpdateSchema = productOperationSchema.extend({
  operationId: idField("operation"),
});
export type ProductOperationUpdateInput = z.infer<typeof productOperationUpdateSchema>;

export const productIdSchema = z.object({ productId: idField("product") });
