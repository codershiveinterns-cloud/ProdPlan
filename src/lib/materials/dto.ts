/**
 * Plain DTOs for the materials module (docs/M1_SPEC.md §4 "Data model": every page maps rows to explicit DTOs
 * before passing them to Client Components). Pure — no Prisma runtime, no server-only imports.
 */
import type { Material } from "@/generated/prisma/client";
import type { NumberLike } from "@/lib/format";
import { toNumberLike } from "@/lib/format";
import { toPlain } from "@/lib/serialize";

export type MaterialDTO = {
  id: string;
  code: string;
  name: string;
  unit: string;
  stockOnHand: number;
  reorderThreshold: number;
  reorderLeadTimeDays: number;
  unitCost: number | null;
  supplier: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export function toMaterialDTO(row: Material): MaterialDTO {
  const plain = toPlain(row);
  return {
    id: plain.id,
    code: plain.code,
    name: plain.name,
    unit: plain.unit,
    stockOnHand: plain.stockOnHand,
    reorderThreshold: plain.reorderThreshold,
    reorderLeadTimeDays: plain.reorderLeadTimeDays,
    unitCost: plain.unitCost,
    supplier: plain.supplier,
    isActive: plain.isActive,
    createdAt: plain.createdAt,
    updatedAt: plain.updatedAt,
  };
}

/** `below` = stock < threshold, `at` = equal (spec §5: "Below reorder", or "At reorder" when equal), null otherwise. */
export type ReorderState = "below" | "at" | null;

export function reorderState(material: { stockOnHand: NumberLike; reorderThreshold: NumberLike }): ReorderState {
  const onHand = toNumberLike(material.stockOnHand);
  const threshold = toNumberLike(material.reorderThreshold);
  if (!Number.isFinite(onHand) || !Number.isFinite(threshold)) return null;
  if (onHand < threshold) return "below";
  if (onHand === threshold) return "at";
  return null;
}

export const REORDER_LABELS: Record<Exclude<ReorderState, null>, string> = {
  below: "Below reorder",
  at: "At reorder",
};
