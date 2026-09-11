import { FilterBar } from "@/components/data/FilterBar";
import { DELIVERY_RISK_META, DELIVERY_RISKS } from "@/components/data/DeliveryRiskBadge";
import { DateInput } from "@/components/forms/DateInput";
import { FormField } from "@/components/forms/FormField";
import { ORDER_PRIORITY_META } from "@/components/data/PriorityBadge";
import { ORDER_STATUS_META } from "@/components/data/StatusBadge";
import { countActiveOrderFilters, type OrderListParams } from "@/lib/orders/list";
import { ORDER_PRIORITIES, ORDER_STATUSES } from "@/lib/orders/status";

const SELECT_CLASS = "h-11 w-full min-w-40 rounded-lg border border-input bg-card px-3 text-sm md:w-auto";

export type OrdersFiltersProps = {
  params: OrderListParams;
  customers: { id: string; name: string }[];
  clearHref?: string;
  /** Hide the customer filter (customer detail page). */
  hideCustomer?: boolean;
};

/** Filter toolbar for the orders list (status, priority, customer, due range). `batch` rides along as a hidden input. */
export function OrdersFilters({ params, customers, clearHref = "/orders", hideCustomer = false }: OrdersFiltersProps) {
  return (
    <FilterBar activeCount={countActiveOrderFilters(params)} clearHref={clearHref}>
      {params.batch ? <input type="hidden" name="batch" value={params.batch} /> : null}
      <FormField label="Status" htmlFor="filter-status">
        <select name="status" defaultValue={params.status} className={SELECT_CLASS}>
          <option value="open">Open</option>
          <option value="all">All</option>
          {ORDER_STATUSES.map((s) => (
            <option key={s} value={s}>
              {ORDER_STATUS_META[s].label}
            </option>
          ))}
        </select>
      </FormField>
      <FormField label="Priority" htmlFor="filter-priority">
        <select name="priority" defaultValue={params.priority} className={SELECT_CLASS}>
          <option value="">Any</option>
          {ORDER_PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {ORDER_PRIORITY_META[p].label}
            </option>
          ))}
        </select>
      </FormField>
      {hideCustomer ? null : (
        <FormField label="Customer" htmlFor="filter-customer">
          <select name="customerId" defaultValue={params.customerId} className={SELECT_CLASS}>
            <option value="">All customers</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </FormField>
      )}
      <FormField label="Delivery risk" htmlFor="filter-risk">
        <select name="risk" defaultValue={params.risk} className={SELECT_CLASS}>
          <option value="">Any</option>
          {DELIVERY_RISKS.map((r) => (
            <option key={r} value={r}>
              {DELIVERY_RISK_META[r].label}
            </option>
          ))}
        </select>
      </FormField>
      <FormField label="Due from" htmlFor="filter-dueFrom">
        <DateInput name="dueFrom" defaultValue={params.dueFrom || undefined} className="md:w-40" />
      </FormField>
      <FormField label="Due to" htmlFor="filter-dueTo">
        <DateInput name="dueTo" defaultValue={params.dueTo || undefined} className="md:w-40" />
      </FormField>
    </FilterBar>
  );
}
