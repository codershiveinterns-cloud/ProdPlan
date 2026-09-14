/**
 * Export kinds/formats + shared constants (docs/M3_SPEC.md §8).
 *
 * Re-exports the Prisma enums so callers don't reach into `@/generated/prisma` directly, and centralises the row
 * cap so `src/lib/export/query.ts`, `csv.ts`, `pdf.ts` and the route handler all agree on the same number.
 */
import { ExportFormat, ExportKind } from "@/generated/prisma/enums";

export { ExportFormat, ExportKind };

export const EXPORT_KINDS: readonly ExportKind[] = Object.values(ExportKind);
export const EXPORT_FORMATS: readonly ExportFormat[] = Object.values(ExportFormat);

/** Hard cap on rows in a single export (spec §8). Exceeding it is a rejected request, never a silent truncation. */
export const EXPORT_MAX_ROWS = 5000;

/** Thrown by `src/lib/export/query.ts` when a filtered query would exceed `EXPORT_MAX_ROWS`. */
export class ExportTooLargeError extends Error {
  readonly total: number;

  constructor(total: number) {
    super(`Narrow your filters; exports are capped at ${EXPORT_MAX_ROWS.toLocaleString()} rows (this filter matches ${total.toLocaleString()}).`);
    this.name = "ExportTooLargeError";
    this.total = total;
  }
}

export const EXPORT_CONTENT_TYPE: Record<ExportFormat, string> = {
  CSV: "text/csv; charset=utf-8",
  PDF: "application/pdf",
};

export const EXPORT_FILE_EXTENSION: Record<ExportFormat, string> = {
  CSV: "csv",
  PDF: "pdf",
};

/** Human label per kind, used in the report title and the ExportJob's fileName. */
export const EXPORT_KIND_LABEL: Record<ExportKind, string> = {
  ORDERS: "Orders",
  SCHEDULE: "Schedule",
  PRODUCTION_STATUS: "Production status",
  AUDIT_LOG: "Audit log",
};

export function isExportKind(value: string): value is ExportKind {
  return (EXPORT_KINDS as readonly string[]).includes(value);
}

export function isExportFormat(value: string): value is ExportFormat {
  return (EXPORT_FORMATS as readonly string[]).includes(value);
}
