/**
 * GET /api/exports/[kind]?format=CSV|PDF&... → streams a CSV/PDF report download (docs/M3_SPEC.md §8).
 *
 * `requirePermission("exports:create")`, validates `kind` (path) and `format` (query) against the `ExportKind`/
 * `ExportFormat` enums, applies the SAME filter query params the source page already uses (reused via
 * `src/lib/export/query.ts`, which itself reuses each module's existing list-query helpers), writes one
 * `ExportJob` row + audit entry in the same transaction, and returns the file with `Content-Type` /
 * `Content-Disposition` headers. Never 500s on a bad filter — `ExportTooLargeError` becomes a 400 with a clear
 * message (spec: "never silently truncate"); any other failure is caught, logged, recorded on the job row, and
 * turned into a controlled error response.
 *
 * `/api/**` is outside the proxy matcher, so the handler authenticates itself (matches `api/orders/template`).
 */
import type { Prisma } from "@/generated/prisma/client";
import { audit, auditContext } from "@/lib/audit";
import { requirePermission } from "@/lib/auth/guards";
import { can } from "@/lib/rbac";
import { ForbiddenError } from "@/lib/errors";
import { buildExportCsv } from "@/lib/export/csv";
import { buildExportPdf } from "@/lib/export/pdf";
import { fetchExportData } from "@/lib/export/query";
import { EXPORT_CONTENT_TYPE, EXPORT_FILE_EXTENSION, EXPORT_KIND_LABEL, ExportTooLargeError, isExportFormat, isExportKind, type ExportFormat, type ExportKind } from "@/lib/export/types";
import { logger } from "@/lib/logger";
import { todayInTz } from "@/lib/dates";
import { hit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/** Per-tenant export rate limit (spec §10.2): 20 exports/minute is plenty for interactive use, tight enough to stop spam. */
const EXPORT_RATE_LIMIT = { limit: 20, windowSec: 60 };

function textResponse(status: number, message: string): Response {
  return new Response(message, { status, headers: { "Content-Type": "text/plain; charset=utf-8" } });
}

function badRequest(message: string): Response {
  return textResponse(400, message);
}

function filtersFromSearchParams(sp: URLSearchParams): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of sp.entries()) {
    if (key === "format") continue;
    out[key] = value;
  }
  return out;
}

export async function GET(req: Request, { params }: { params: Promise<{ kind: string }> }): Promise<Response> {
  let session;
  let db;
  try {
    ({ session, db } = await requirePermission("exports:create"));
  } catch (err) {
    if (err instanceof ForbiddenError) return new Response("Forbidden", { status: 403 });
    throw err;
  }

  const { kind: kindRaw } = await params;
  const kindUpper = kindRaw.toUpperCase();
  if (!isExportKind(kindUpper)) {
    return badRequest(`Unknown export kind "${kindRaw}". Expected one of: ORDERS, SCHEDULE, PRODUCTION_STATUS, AUDIT_LOG.`);
  }
  const kind: ExportKind = kindUpper;

  // AUDIT_LOG carries actor identities and before/after diffs across the whole tenant — exporting it requires the
  // same `audit:read-all` permission that gates viewing /settings/audit, not just the general `exports:create`
  // permission SUPERVISOR/PLANNER also hold.
  if (kind === "AUDIT_LOG" && !can(session.user.role, "audit:read-all")) {
    return new Response("Forbidden", { status: 403 });
  }

  const url = new URL(req.url);
  const formatRaw = (url.searchParams.get("format") ?? "CSV").toUpperCase();
  if (!isExportFormat(formatRaw)) {
    return badRequest(`Unknown export format "${formatRaw}". Expected CSV or PDF.`);
  }
  const format: ExportFormat = formatRaw;

  const rateLimit = await hit(`exports:${session.tenant.id}`, EXPORT_RATE_LIMIT.limit, EXPORT_RATE_LIMIT.windowSec);
  if (rateLimit.limited) {
    return new Response(`Too many exports. Try again in ${rateLimit.retryAfterMinutes} minute${rateLimit.retryAfterMinutes === 1 ? "" : "s"}.`, {
      status: 429,
      headers: { "Content-Type": "text/plain; charset=utf-8", "Retry-After": String(rateLimit.retryAfterSec) },
    });
  }
  const tz = session.tenant.timezone;
  const todayIso = todayInTz(tz);
  const ctx = await auditContext(session);
  const filters = filtersFromSearchParams(url.searchParams);
  const ext = EXPORT_FILE_EXTENSION[format];
  const fileName = `${kind.toLowerCase().replace(/_/g, "-")}-export-${todayIso}.${ext}`;

  try {
    const data = await fetchExportData(kind, db, tz, todayIso, url.searchParams);
    const rowCount = data.rows.length;

    const body: BodyInit =
      format === "CSV"
        ? buildExportCsv(data, tz)
        : new Uint8Array(await buildExportPdf(data, { tenantName: session.tenant.name, tz, generatedAt: new Date() }));

    await db.$transaction(async (tx) => {
      const job = await tx.exportJob.create({
        data: {
          tenantId: session.tenant.id,
          requestedById: session.user.id,
          kind,
          format,
          filters: filters as Prisma.InputJsonValue,
          fileName,
          rowCount,
          status: "READY",
        },
      });
      await audit(tx, ctx, {
        entityType: "ExportJob",
        entityId: job.id,
        entityLabel: fileName,
        action: "CREATE",
        after: { kind, format, filters, fileName, rowCount, status: "READY" },
        summary: `exported ${rowCount} ${EXPORT_KIND_LABEL[kind].toLowerCase()} row${rowCount === 1 ? "" : "s"} as ${format}`,
      });
    });

    return new Response(body, {
      status: 200,
      headers: {
        "Content-Type": EXPORT_CONTENT_TYPE[format],
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    const message = err instanceof ExportTooLargeError ? err.message : "Export failed. Try a narrower filter or try again.";
    const status = err instanceof ExportTooLargeError ? 400 : 500;
    if (!(err instanceof ExportTooLargeError)) {
      logger.error("export failed", { kind, format, tenantId: session.tenant.id, error: err instanceof Error ? err.message : String(err) });
    }
    try {
      await db.$transaction(async (tx) => {
        const job = await tx.exportJob.create({
          data: {
            tenantId: session.tenant.id,
            requestedById: session.user.id,
            kind,
            format,
            filters: filters as Prisma.InputJsonValue,
            fileName,
            status: "FAILED",
            error: message,
          },
        });
        await audit(tx, ctx, {
          entityType: "ExportJob",
          entityId: job.id,
          entityLabel: fileName,
          action: "CREATE",
          after: { kind, format, filters, fileName, status: "FAILED", error: message },
          summary: `export of ${EXPORT_KIND_LABEL[kind].toLowerCase()} failed`,
        });
      });
    } catch (auditErr) {
      logger.error("failed to record failed ExportJob", { error: auditErr instanceof Error ? auditErr.message : String(auditErr) });
    }
    return textResponse(status, message);
  }
}
