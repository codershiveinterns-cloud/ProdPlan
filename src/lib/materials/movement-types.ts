/**
 * Stock movement type metadata (docs/M1_SPEC.md §4 "Stock", §6.4 "Ledger"). Pure — safe to import from Client
 * Components (the MovementDialog Select) and Server Components (the ledger type badge) alike.
 */
import type { StockMovementType } from "@/generated/prisma/enums";

export type MovementTypeMeta = {
  label: string;
  /** Badge classes (outline variant). RECEIPT green · ISSUE red · RETURN blue · ADJUSTMENT amber. */
  className: string;
  /** One-line helper shown under the Type select. */
  description: string;
  /** Sign applied to the entered quantity ("counted" = the user enters the new stock on hand). */
  effect: "add" | "remove" | "counted";
};

export const MOVEMENT_TYPE_META: Record<StockMovementType, MovementTypeMeta> = {
  RECEIPT: {
    label: "Receipt",
    className: "border-green-200 bg-green-50 text-green-700",
    description: "Goods received from a supplier — adds to stock on hand.",
    effect: "add",
  },
  ISSUE: {
    label: "Issue",
    className: "border-red-200 bg-red-50 text-red-700",
    description: "Material issued to production — removes from stock on hand.",
    effect: "remove",
  },
  RETURN: {
    label: "Return",
    className: "border-blue-200 bg-blue-50 text-blue-700",
    description: "Unused material returned from the floor — adds to stock on hand.",
    effect: "add",
  },
  ADJUSTMENT: {
    label: "Adjustment",
    className: "border-amber-200 bg-amber-50 text-amber-800",
    description: "Physical count override — enter the counted stock on hand; the difference is recorded.",
    effect: "counted",
  },
};

/** Display order for selects and legends. */
export const MOVEMENT_TYPES = ["RECEIPT", "ISSUE", "RETURN", "ADJUSTMENT"] as const satisfies readonly StockMovementType[];

export function movementTypeLabel(type: StockMovementType): string {
  return MOVEMENT_TYPE_META[type].label;
}

export function isStockMovementType(value: unknown): value is StockMovementType {
  return typeof value === "string" && value in MOVEMENT_TYPE_META;
}
