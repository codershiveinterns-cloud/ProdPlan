/**
 * `/schedule/conflicts` URL params (docs/M2_SPEC.md §3): `type`, `severity`, `resolved` (default unresolved only;
 * `?resolved=1` shows all), `page`.
 */
import { ConflictSeverity, ConflictType } from "@/generated/prisma/enums";
import type { ConflictFilters } from "@/lib/scheduling/queries";

export type ConflictsSearchParams = Record<string, string | string[] | undefined>;

function first(sp: ConflictsSearchParams, key: string): string | undefined {
  const raw = sp[key];
  const value = Array.isArray(raw) ? raw[0] : raw;
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}

export type ParsedConflictParams = { filters: ConflictFilters; page: number; showAll: boolean };

const TYPES = new Set<string>(Object.values(ConflictType));
const SEVERITIES = new Set<string>(Object.values(ConflictSeverity));

export function parseConflictParams(sp: ConflictsSearchParams): ParsedConflictParams {
  const typeRaw = first(sp, "type");
  const severityRaw = first(sp, "severity");
  const showAll = first(sp, "resolved") === "1";
  const pageRaw = Number.parseInt(first(sp, "page") ?? "1", 10);
  const page = Number.isFinite(pageRaw) && pageRaw >= 1 ? pageRaw : 1;

  return {
    filters: {
      type: typeRaw && TYPES.has(typeRaw) ? (typeRaw as ConflictType) : undefined,
      severity: severityRaw && SEVERITIES.has(severityRaw) ? (severityRaw as ConflictSeverity) : undefined,
      resolved: showAll ? undefined : false,
    },
    page,
    showAll,
  };
}

export function conflictsHref(params: ParsedConflictParams, patch: Partial<{ type: string; severity: string; resolved: boolean; page: number }>): string {
  const type = "type" in patch ? patch.type : params.filters.type;
  const severity = "severity" in patch ? patch.severity : params.filters.severity;
  const showAll = "resolved" in patch ? patch.resolved : params.showAll;
  const page = "page" in patch ? patch.page : params.page;
  const q = new URLSearchParams();
  if (type) q.set("type", type);
  if (severity) q.set("severity", severity);
  if (showAll) q.set("resolved", "1");
  if (page && page > 1) q.set("page", String(page));
  const query = q.toString();
  return query ? `/schedule/conflicts?${query}` : "/schedule/conflicts";
}
