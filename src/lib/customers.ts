/**
 * Customers module (docs/M1_SPEC.md §4 "Customers", §6.7).
 *
 * Names are trimmed with internal whitespace collapsed; uniqueness and lookups are case-insensitive
 * (`mode: "insensitive"`) while the typed casing is what gets stored. `findOrCreateCustomer(tx, name)` is the shared
 * helper used by the order form and the CSV import. Hard delete is blocked while orders reference the customer
 * (the UI offers Deactivate instead).
 */
import type { Customer } from "@/generated/prisma/client";
import type { CustomerOrderByWithRelationInput, CustomerWhereInput } from "@/generated/prisma/models";
import { isPrismaKnownError } from "@/lib/action";
import { audit, auditContext } from "@/lib/audit";
import type { Session } from "@/lib/auth/guards";
import { customerNameKey, normalizeCustomerName } from "@/lib/customers-normalize";
import type { TenantDb, TenantTx } from "@/lib/db";
import { DomainError, NotFoundError } from "@/lib/errors";
import { fieldIssue } from "@/lib/orders/issues";
import { whereOpen } from "@/lib/orders/kpis";
import { toDateOnly } from "@/lib/dates";
import { toPlain } from "@/lib/serialize";
import type { CustomerInput } from "@/lib/validation/customers";
import type { SortDir } from "@/components/data/DataTable";

export const CUSTOMERS_PAGE_SIZE = 25;

// ---------------------------------------------------------------------------------------------------------------
// Shared helper
// ---------------------------------------------------------------------------------------------------------------

export type FindOrCreateResult = { customer: Customer; created: boolean };

/**
 * Case-insensitive lookup by normalised name; creates the customer with the typed casing when none exists.
 * Must run on the scoped transaction of the mutation that needs it. The caller writes the CREATE audit row when
 * `created` is true (the import writes one IMPORT row instead).
 */
export async function findOrCreateCustomer(tx: TenantTx | TenantDb, rawName: string): Promise<FindOrCreateResult> {
  const name = normalizeCustomerName(rawName);
  if (!name) throw new DomainError("Customer name is required");
  const existing = await tx.customer.findFirst({ where: { name: { equals: name, mode: "insensitive" } } });
  if (existing) return { customer: existing, created: false };
  const customer = await tx.customer.create({ data: { tenantId: tx.$tenantId, name } });
  return { customer, created: true };
}

/** `customerNameKey` → Customer for every name that already exists (one case-insensitive `in` query). */
export async function findCustomersByNames(
  tx: TenantTx | TenantDb,
  names: readonly string[],
): Promise<Map<string, { id: string; name: string }>> {
  const distinct = [...new Set(names.map(normalizeCustomerName).filter(Boolean))];
  const map = new Map<string, { id: string; name: string }>();
  if (distinct.length === 0) return map;
  const rows = await tx.customer.findMany({
    where: { name: { in: distinct, mode: "insensitive" } },
    select: { id: true, name: true },
  });
  for (const row of rows) map.set(customerNameKey(row.name), row);
  return map;
}

// ---------------------------------------------------------------------------------------------------------------
// List
// ---------------------------------------------------------------------------------------------------------------

export const CUSTOMER_SORT_KEYS = ["name", "code", "email", "createdAt"] as const;
export type CustomerSortKey = (typeof CUSTOMER_SORT_KEYS)[number];

export type CustomerListParams = {
  q: string;
  page: number;
  sort: CustomerSortKey;
  dir: SortDir;
  includeInactive: boolean;
};

type SearchParams = Record<string, string | string[] | undefined>;

function first(v: string | string[] | undefined): string {
  return (Array.isArray(v) ? v[0] : v) ?? "";
}

export function parseCustomerListParams(sp: SearchParams): CustomerListParams {
  const q = first(sp.q).trim().slice(0, 120);
  const pageRaw = Number.parseInt(first(sp.page), 10);
  const page = Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1;
  const sortRaw = first(sp.sort);
  const sort = (CUSTOMER_SORT_KEYS as readonly string[]).includes(sortRaw) ? (sortRaw as CustomerSortKey) : "name";
  const dir: SortDir = first(sp.dir).toLowerCase() === "desc" ? "desc" : "asc";
  const includeInactive = first(sp.includeInactive) === "1";
  return { q, page, sort, dir, includeInactive };
}

/** Query string for a list URL; default values are omitted so links stay short. */
export function customerListQuery(params: Partial<CustomerListParams>): string {
  const sp = new URLSearchParams();
  if (params.q) sp.set("q", params.q);
  if (params.page && params.page > 1) sp.set("page", String(params.page));
  const sort = params.sort ?? "name";
  const dir = params.dir ?? "asc";
  if (sort !== "name" || dir !== "asc") {
    sp.set("sort", sort);
    sp.set("dir", dir);
  }
  if (params.includeInactive) sp.set("includeInactive", "1");
  const s = sp.toString();
  return s ? `?${s}` : "";
}

export function countActiveCustomerFilters(params: CustomerListParams): number {
  return params.includeInactive ? 1 : 0;
}

export function customerListWhere(params: CustomerListParams): CustomerWhereInput {
  const and: CustomerWhereInput[] = [];
  if (!params.includeInactive) and.push({ isActive: true });
  if (params.q) {
    const contains = { contains: params.q, mode: "insensitive" as const };
    and.push({ OR: [{ name: contains }, { code: contains }, { email: contains }, { phone: contains }] });
  }
  return and.length ? { AND: and } : {};
}

export function customerListOrderBy(params: CustomerListParams): CustomerOrderByWithRelationInput[] {
  const dir = params.dir;
  switch (params.sort) {
    case "code":
      return [{ code: { sort: dir, nulls: "last" } }, { name: "asc" }];
    case "email":
      return [{ email: { sort: dir, nulls: "last" } }, { name: "asc" }];
    case "createdAt":
      return [{ createdAt: dir }, { name: "asc" }];
    default:
      return [{ name: dir }];
  }
}

export type CustomerListRow = {
  id: string;
  name: string;
  code: string | null;
  email: string | null;
  phone: string | null;
  isActive: boolean;
  openOrders: number;
  /** `YYYY-MM-DD` of the earliest open order, or null. */
  nextDue: string | null;
};

export async function listCustomers(
  db: TenantDb,
  params: CustomerListParams,
): Promise<{ rows: CustomerListRow[]; total: number }> {
  const where = customerListWhere(params);
  const [total, rows] = await Promise.all([
    db.customer.count({ where }),
    db.customer.findMany({
      where,
      orderBy: customerListOrderBy(params),
      skip: (params.page - 1) * CUSTOMERS_PAGE_SIZE,
      take: CUSTOMERS_PAGE_SIZE,
      select: {
        id: true,
        name: true,
        code: true,
        email: true,
        phone: true,
        isActive: true,
        _count: { select: { orders: { where: whereOpen() } } },
        orders: { where: whereOpen(), orderBy: { dueDate: "asc" }, take: 1, select: { dueDate: true } },
      },
    }),
  ]);
  return {
    total,
    rows: rows.map((c) => ({
      id: c.id,
      name: c.name,
      code: c.code,
      email: c.email,
      phone: c.phone,
      isActive: c.isActive,
      openOrders: c._count.orders,
      nextDue: c.orders[0] ? toDateOnly(c.orders[0].dueDate) : null,
    })),
  };
}

/** Active customers for pickers (Combobox options). */
export async function listCustomerOptions(db: TenantDb): Promise<{ id: string; name: string; code: string | null }[]> {
  return db.customer.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true, code: true },
  });
}

// ---------------------------------------------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------------------------------------------

function duplicateMessage(name: string): string {
  return `A customer named "${name}" already exists`;
}

async function assertNameAvailable(tx: TenantTx, name: string, excludeId?: string): Promise<void> {
  const clash = await tx.customer.findFirst({
    where: { name: { equals: name, mode: "insensitive" }, ...(excludeId ? { id: { not: excludeId } } : {}) },
    select: { name: true },
  });
  if (clash) fieldIssue("name", duplicateMessage(clash.name));
}

function customerSnapshot(c: Customer) {
  return toPlain({
    name: c.name,
    code: c.code,
    email: c.email,
    phone: c.phone,
    notes: c.notes,
    isActive: c.isActive,
  });
}

function rethrowDuplicate(err: unknown, name: string): never {
  if (isPrismaKnownError(err) && err.code === "P2002") fieldIssue("name", duplicateMessage(name));
  throw err;
}

export async function createCustomer(db: TenantDb, session: Session, input: CustomerInput): Promise<Customer> {
  const ctx = await auditContext(session);
  try {
    return await db.$transaction(async (tx) => {
      await assertNameAvailable(tx, input.name);
      const customer = await tx.customer.create({
        data: {
          tenantId: session.tenant.id,
          name: input.name,
          code: input.code ?? null,
          email: input.email ?? null,
          phone: input.phone ?? null,
          notes: input.notes ?? null,
          isActive: input.isActive ?? true,
        },
      });
      await audit(tx, ctx, {
        entityType: "Customer",
        entityId: customer.id,
        entityLabel: customer.name,
        action: "CREATE",
        after: customerSnapshot(customer),
        summary: `Customer ${customer.name} created`,
      });
      return customer;
    });
  } catch (err) {
    rethrowDuplicate(err, input.name);
  }
}

export async function getCustomer(db: TenantDb, id: string): Promise<Customer | null> {
  return db.customer.findUnique({ where: { id } });
}

export async function updateCustomer(db: TenantDb, session: Session, id: string, input: CustomerInput): Promise<Customer> {
  const ctx = await auditContext(session);
  try {
    return await db.$transaction(async (tx) => {
      const before = await tx.customer.findUnique({ where: { id } });
      if (!before) throw new NotFoundError("Customer not found.");
      await assertNameAvailable(tx, input.name, id);
      const after = await tx.customer.update({
        where: { id },
        data: {
          name: input.name,
          code: input.code ?? null,
          email: input.email ?? null,
          phone: input.phone ?? null,
          notes: input.notes ?? null,
          ...(input.isActive === undefined ? {} : { isActive: input.isActive }),
        },
      });
      await audit(tx, ctx, {
        entityType: "Customer",
        entityId: id,
        entityLabel: after.name,
        action: "UPDATE",
        before: customerSnapshot(before),
        after: customerSnapshot(after),
        summary: `Customer ${after.name} updated`,
      });
      return after;
    });
  } catch (err) {
    rethrowDuplicate(err, input.name);
  }
}

export async function setCustomerActive(db: TenantDb, session: Session, id: string, isActive: boolean): Promise<Customer> {
  const ctx = await auditContext(session);
  return db.$transaction(async (tx) => {
    const before = await tx.customer.findUnique({ where: { id } });
    if (!before) throw new NotFoundError("Customer not found.");
    const after = await tx.customer.update({ where: { id }, data: { isActive } });
    await audit(tx, ctx, {
      entityType: "Customer",
      entityId: id,
      entityLabel: after.name,
      action: "UPDATE",
      before: customerSnapshot(before),
      after: customerSnapshot(after),
      summary: `Customer ${after.name} ${isActive ? "reactivated" : "deactivated"}`,
    });
    return after;
  });
}

export function customerInUseMessage(name: string, orders: number): string {
  return `${name} has ${orders} order${orders === 1 ? "" : "s"} and cannot be deleted. Deactivate it instead.`;
}

/** Hard delete, only when no order references the customer (count check + P2003 fallback). */
export async function deleteCustomer(db: TenantDb, session: Session, id: string): Promise<void> {
  const ctx = await auditContext(session);
  try {
    await db.$transaction(async (tx) => {
      const customer = await tx.customer.findUnique({ where: { id } });
      if (!customer) throw new NotFoundError("Customer not found.");
      const orders = await tx.order.count({ where: { customerId: id } });
      if (orders > 0) throw new DomainError(customerInUseMessage(customer.name, orders), "in_use", 409);
      await tx.customer.delete({ where: { id } });
      await audit(tx, ctx, {
        entityType: "Customer",
        entityId: id,
        entityLabel: customer.name,
        action: "DELETE",
        before: customerSnapshot(customer),
        summary: `Customer ${customer.name} deleted`,
      });
    });
  } catch (err) {
    if (isPrismaKnownError(err) && err.code === "P2003") {
      throw new DomainError("This customer has orders and cannot be deleted. Deactivate it instead.", "in_use", 409);
    }
    throw err;
  }
}
