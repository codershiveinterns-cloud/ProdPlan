/**
 * GET /api/orders/template → the CSV import template: header + 2 example rows (docs/M1_SPEC.md §6.1 step 1).
 * Written with `toCsv` (BOM, CRLF, RFC 4180 quoting, formula-injection guard). `/api/**` is outside the proxy
 * matcher, so the handler authenticates itself.
 */
import { requirePermission } from "@/lib/auth/guards";
import { ForbiddenError } from "@/lib/errors";
import { buildOrdersTemplateCsv, TEMPLATE_FILE_NAME } from "@/lib/orders/template";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  try {
    await requirePermission("orders:read");
  } catch (err) {
    if (err instanceof ForbiddenError) return new Response("Forbidden", { status: 403 });
    throw err;
  }
  return new Response(buildOrdersTemplateCsv(), {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${TEMPLATE_FILE_NAME}"`,
      "Cache-Control": "no-store",
    },
  });
}
