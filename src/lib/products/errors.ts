import { DomainError } from "@/lib/errors";

/**
 * A business-rule violation that belongs to ONE form field (e.g. "Already in this BOM" on `materialId`).
 * The products actions map it to `fieldError(field, message)` so the message renders under the right input;
 * anywhere else it behaves like a plain `DomainError` (its message is safe to show verbatim).
 */
export class ProductFieldError extends DomainError {
  readonly field: string;

  constructor(field: string, message: string) {
    super(message, "product_field");
    this.field = field;
  }
}

export const BOM_DUPLICATE_MESSAGE = "Already in this BOM";
export const MACHINE_WORK_CENTER_MESSAGE = "This machine does not belong to the selected work center";
export const MACHINE_INACTIVE_MESSAGE = "This machine is inactive (retired). Pick another machine or leave it blank";
