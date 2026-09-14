import { FilterBar } from "@/components/data/FilterBar";
import { DateInput } from "@/components/forms/DateInput";
import { FormField } from "@/components/forms/FormField";
import { AUDIT_ACTIONS, countActiveAuditLogFilters, type AuditLogListParams } from "@/lib/audit-log-list";

const SELECT_CLASS = "h-11 w-full min-w-40 rounded-lg border border-input bg-card px-3 text-sm md:w-auto";

const ACTION_LABELS: Record<(typeof AUDIT_ACTIONS)[number], string> = {
  CREATE: "Created",
  UPDATE: "Updated",
  DELETE: "Deleted",
  STATUS_CHANGE: "Status change",
  IMPORT: "Imported",
  LOGIN: "Signed in",
};

const ENTITY_TYPES = [
  "Order",
  "Customer",
  "Product",
  "ProductOperation",
  "BomItem",
  "Material",
  "StockMovement",
  "WorkCenter",
  "Machine",
  "DowntimeWindow",
  "ShiftCalendar",
  "Shift",
  "CalendarException",
  "User",
  "Tenant",
  "ImportBatch",
  "ScheduleRun",
  "ScheduleEntry",
] as const;

export type AuditLogFiltersProps = {
  params: AuditLogListParams;
  actors: { id: string; name: string }[];
};

/** Filter toolbar for the audit log (docs/M3_SPEC.md §9): entity type, action, actor, date range. */
export function AuditLogFilters({ params, actors }: AuditLogFiltersProps) {
  return (
    <FilterBar activeCount={countActiveAuditLogFilters(params)} clearHref="/settings/audit">
      <FormField label="Entity type" htmlFor="filter-entityType">
        <select name="entityType" defaultValue={params.entityType} className={SELECT_CLASS}>
          <option value="">Any</option>
          {ENTITY_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </FormField>
      <FormField label="Action" htmlFor="filter-action">
        <select name="action" defaultValue={params.action} className={SELECT_CLASS}>
          <option value="">Any</option>
          {AUDIT_ACTIONS.map((a) => (
            <option key={a} value={a}>
              {ACTION_LABELS[a]}
            </option>
          ))}
        </select>
      </FormField>
      <FormField label="Actor" htmlFor="filter-actorId">
        <select name="actorId" defaultValue={params.actorId} className={SELECT_CLASS}>
          <option value="">Anyone</option>
          {actors.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </FormField>
      <FormField label="From" htmlFor="filter-from">
        <DateInput name="from" defaultValue={params.from || undefined} className="md:w-40" />
      </FormField>
      <FormField label="To" htmlFor="filter-to">
        <DateInput name="to" defaultValue={params.to || undefined} className="md:w-40" />
      </FormField>
    </FilterBar>
  );
}
