/** CSV import template (docs/M1_SPEC.md §6.1 step 1): header + 2 example rows, via the formula-safe writer. */
import { toCsv } from "@/lib/csv";
import { IMPORT_COLUMNS, IMPORT_TEMPLATE_EXAMPLES } from "@/lib/validation/import-row";

export const TEMPLATE_FILE_NAME = "orders-import-template.csv";

export function buildOrdersTemplateCsv(): string {
  return toCsv(IMPORT_COLUMNS, IMPORT_TEMPLATE_EXAMPLES);
}
