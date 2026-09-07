/**
 * Demo data for ONE tenant (docs/M1_SPEC.md §7). Used by BOTH `prisma/seed.ts` and the dashboard's
 * "Load demo data" action, so it only ever talks to the tenant-scoped client it is handed.
 *
 * Guarantees:
 *  - refuses (DomainError) unless the plant has 0 products and 0 orders;
 *  - everything is created inside ONE `db.$transaction` with a bounded number of statements (createMany*), so a
 *    failure leaves nothing behind and the load stays fast on a remote (Neon/Netlify) database;
 *  - all dates are relative to "today" in the tenant timezone (`todayInTz`), timestamps are wall-clock times in that
 *    zone converted to UTC instants;
 *  - stock balances are computed in code: RECEIPT history first, then ISSUE movements for every order that has
 *    started (IN_PROGRESS / COMPLETED); `balanceAfter` is the running balance and `Material.stockOnHand` equals the
 *    final balance. The seed throws if a balance would go negative (dataset consistency check);
 *  - every row gets an audit entry (batched `auditLog.createMany`, timestamps matching the entity), plus one IMPORT
 *    row written through `audit()` at the end;
 *  - master data that already exists under the same business key (calendar name, customer name, work center /
 *    machine / material code) is reused rather than duplicated — a plant that added a work center before clicking
 *    "Load demo data" still gets the full demo.
 */
import type { Prisma } from "@/generated/prisma/client";
import type { AuditAction, OrderStatus } from "@/generated/prisma/enums";
import { audit, changedFields, redactSnapshot, type AuditActor } from "@/lib/audit";
import type { UserDTO } from "@/lib/auth/user-dto";
import { userSelect } from "@/lib/auth/user-dto";
import { requiredPerUnit, round3 } from "@/lib/bom";
import { addDays, fromDateOnly, todayInTz, weekdayOf, zonedToUtc } from "@/lib/dates";
import type { TenantDb, TenantTx } from "@/lib/db";
import { DomainError } from "@/lib/errors";
import { customerNameKey } from "@/lib/customers-normalize";
import { reservedOrderNumbers } from "@/lib/orders/numbers";
import { transitionSummary } from "@/lib/orders/status";
import { SEQUENCE_STEP } from "@/lib/routing";
import { demoDataset, type DemoDataset, type DemoVariant } from "./demo-data";

export const DEMO_NOT_EMPTY_MESSAGE = "Demo data can only be loaded into an empty plant";
/** entityType of the single IMPORT audit row a demo load writes (entityId = tenant id). */
export const DEMO_DATA_ENTITY_TYPE = "DemoData";

export type DemoTenant = { id: string; timezone: string; defaultCalendarId: string | null };

export type SeedDemoOptions = {
  variant?: DemoVariant;
  /** The instant "now" (defaults to the wall clock); injectable for deterministic tests. */
  now?: Date;
  /** Request metadata copied onto the audit rows (from `auditContext()` in the dashboard action). */
  ip?: string | null;
  userAgent?: string | null;
};

export type SeedDemoCounts = {
  customers: number;
  workCenters: number;
  calendars: number;
  shifts: number;
  calendarExceptions: number;
  machines: number;
  materials: number;
  products: number;
  bomItems: number;
  operations: number;
  orders: number;
  stockMovements: number;
  downtimeWindows: number;
  auditRows: number;
};

export type SeedDemoResult = {
  variant: DemoVariant;
  today: string;
  defaultCalendarId: string;
  orderNumbers: string[];
  counts: SeedDemoCounts;
};

const TX_OPTIONS = { timeout: 60_000, maxWait: 10_000 } as const;

type AuditRowSpec = {
  actor: AuditActor;
  createdAt: Date;
  entityType: string;
  entityId: string;
  entityLabel?: string | null;
  action: AuditAction;
  before?: unknown;
  after?: unknown;
  summary: string;
};

type RequestMeta = { ip: string | null; userAgent: string | null };

/** Same shape `audit()` writes, but with an explicit `createdAt` so the activity feed tells a story. */
function auditRow(tenantId: string, meta: RequestMeta, spec: AuditRowSpec): Prisma.AuditLogCreateManyInput {
  const before = redactSnapshot(spec.before);
  const after = redactSnapshot(spec.after);
  return {
    tenantId,
    actorUserId: spec.actor.id,
    actorEmail: spec.actor.email,
    actorName: spec.actor.name,
    ip: meta.ip,
    userAgent: meta.userAgent,
    entityType: spec.entityType,
    entityId: spec.entityId,
    entityLabel: spec.entityLabel ?? null,
    action: spec.action,
    summary: spec.summary,
    changedFields: changedFields(before, after),
    before: before == null ? undefined : (before as Prisma.InputJsonValue),
    after: after == null ? undefined : (after as Prisma.InputJsonValue),
    createdAt: spec.createdAt,
  };
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** First Friday strictly after today + 7 (the demo's plant holiday). */
export function demoHolidayDate(today: string): string {
  for (let i = 8; i < 16; i++) {
    const date = addDays(today, i);
    if (weekdayOf(date) === 5) return date;
  }
  // Unreachable: any 7-day span contains a Friday.
  return addDays(today, 8);
}

function byKey<T>(rows: readonly T[], key: (row: T) => string): Map<string, T> {
  return new Map(rows.map((row) => [key(row), row]));
}

function must<T>(map: Map<string, T>, key: string, what: string): T {
  const value = map.get(key);
  if (value === undefined) throw new Error(`Demo dataset is inconsistent: unknown ${what} "${key}"`);
  return value;
}

/**
 * Loads the demo plant into the tenant behind `db`. `actor` is the user the load is attributed to (null → the
 * plant's first active ADMIN). Throws `DomainError` when the plant already has products or orders.
 */
export async function seedDemoData(
  db: TenantDb,
  tenant: DemoTenant,
  actor: UserDTO | null,
  opts: SeedDemoOptions = {},
): Promise<SeedDemoResult> {
  const variant = opts.variant ?? "acme";
  const data = demoDataset(variant);
  const now = opts.now ?? new Date();
  const tz = tenant.timezone;
  const today = todayInTz(tz, now);
  const meta: RequestMeta = { ip: opts.ip ?? null, userAgent: opts.userAgent ?? null };
  const at = (dayOffset: number, hhmm: string): Date => zonedToUtc(addDays(today, dayOffset), hhmm, tz);

  return db.$transaction(async (tx) => {
    // ---- 1. Guard: empty plant --------------------------------------------------------------------------------
    const [productCount, orderCount] = await Promise.all([tx.product.count(), tx.order.count()]);
    if (productCount > 0 || orderCount > 0) {
      throw new DomainError(DEMO_NOT_EMPTY_MESSAGE, "demo_not_empty", 409);
    }

    // ---- 2. Actors ------------------------------------------------------------------------------------------
    const users = await tx.user.findMany({ where: { isActive: true }, orderBy: { createdAt: "asc" }, select: userSelect });
    const admin: UserDTO | undefined = actor ?? users.find((u) => u.role === "ADMIN") ?? users[0];
    if (!admin) throw new DomainError("Demo data needs at least one active user in the plant");
    const planner = users.find((u) => u.role === "PLANNER") ?? admin;
    const supervisor = users.find((u) => u.role === "SUPERVISOR") ?? planner;

    const auditRows: Prisma.AuditLogCreateManyInput[] = [];
    const log = (spec: AuditRowSpec) => auditRows.push(auditRow(tenant.id, meta, spec));
    const created = (
      actorUser: AuditActor,
      createdAt: Date,
      entityType: string,
      entityId: string,
      entityLabel: string,
      after: unknown,
      summary: string,
    ) => log({ actor: actorUser, createdAt, entityType, entityId, entityLabel, action: "CREATE", after, summary });

    const counts: SeedDemoCounts = {
      customers: 0,
      workCenters: 0,
      calendars: 0,
      shifts: 0,
      calendarExceptions: 0,
      machines: 0,
      materials: 0,
      products: 0,
      bomItems: 0,
      operations: 0,
      orders: 0,
      stockMovements: 0,
      downtimeWindows: 0,
      auditRows: 0,
    };

    // ---- 3. Customers (reuse by case-insensitive name) ---------------------------------------------------------
    const existingCustomers = await tx.customer.findMany({ select: { id: true, name: true } });
    const customerIds = new Map(existingCustomers.map((c) => [customerNameKey(c.name), c.id]));
    const newCustomers = data.customers.filter((c) => !customerIds.has(customerNameKey(c.name)));
    if (newCustomers.length > 0) {
      const rows = await tx.customer.createManyAndReturn({
        data: newCustomers.map((c, i) => ({
          tenantId: tenant.id,
          name: c.name,
          code: c.code,
          email: c.email ?? null,
          phone: c.phone ?? null,
          notes: c.notes ?? null,
          createdAt: at(-28, `09:${pad2(5 + i)}`),
        })),
        select: { id: true, name: true, code: true, email: true, phone: true, notes: true, isActive: true, createdAt: true },
      });
      for (const row of rows) {
        customerIds.set(customerNameKey(row.name), row.id);
        const { id, createdAt, ...after } = row;
        created(admin, createdAt, "Customer", id, row.name, after, `Created customer ${row.name}`);
      }
      counts.customers = rows.length;
    }

    // ---- 4. Work centers (reuse by code) ----------------------------------------------------------------------
    const existingWcs = await tx.workCenter.findMany({ select: { id: true, code: true } });
    const workCenterIds = new Map(existingWcs.map((w) => [w.code.toUpperCase(), w.id]));
    const newWcs = data.workCenters.filter((w) => !workCenterIds.has(w.code.toUpperCase()));
    if (newWcs.length > 0) {
      const rows = await tx.workCenter.createManyAndReturn({
        data: newWcs.map((w, i) => ({
          tenantId: tenant.id,
          code: w.code,
          name: w.name,
          description: w.description ?? null,
          createdAt: at(-28, `09:${pad2(30 + i)}`),
        })),
        select: { id: true, code: true, name: true, description: true, isActive: true, createdAt: true },
      });
      for (const row of rows) {
        workCenterIds.set(row.code.toUpperCase(), row.id);
        const { id, createdAt, ...after } = row;
        created(admin, createdAt, "WorkCenter", id, row.code, after, `Created work center ${row.code} · ${row.name}`);
      }
      counts.workCenters = rows.length;
    }

    // ---- 5. Calendars + shifts (reuse by name), holiday exception, tenant default -----------------------------
    const existingCalendars = await tx.shiftCalendar.findMany({ select: { id: true, name: true } });
    const calendarIds = new Map(existingCalendars.map((c) => [c.name.toLowerCase(), c.id]));
    const calendarsAt = at(-28, "09:40");
    const shiftRows: Prisma.ShiftCreateManyInput[] = [];
    for (const cal of data.calendars) {
      if (calendarIds.has(cal.name.toLowerCase())) continue;
      const row = await tx.shiftCalendar.create({
        data: { tenantId: tenant.id, name: cal.name, createdAt: calendarsAt },
        select: { id: true, name: true, isActive: true },
      });
      calendarIds.set(cal.name.toLowerCase(), row.id);
      counts.calendars += 1;
      created(admin, calendarsAt, "ShiftCalendar", row.id, row.name, { name: row.name, isActive: row.isActive, shifts: cal.shifts }, `Created shift calendar ${row.name}`);
      for (const shift of cal.shifts) {
        shiftRows.push({
          tenantId: tenant.id,
          calendarId: row.id,
          name: shift.name,
          startTime: shift.startTime,
          endTime: shift.endTime,
          daysOfWeek: shift.daysOfWeek,
          breakMinutes: shift.breakMinutes,
          createdAt: calendarsAt,
        });
      }
    }
    if (shiftRows.length > 0) {
      const rows = await tx.shift.createManyAndReturn({
        data: shiftRows,
        select: { id: true, calendarId: true, name: true, startTime: true, endTime: true, daysOfWeek: true, breakMinutes: true },
      });
      const calendarNameById = new Map([...calendarIds].map(([name, id]) => [id, name]));
      for (const row of rows) {
        const { id, calendarId, ...after } = row;
        const calName = data.calendars.find((c) => c.name.toLowerCase() === calendarNameById.get(calendarId))?.name ?? "calendar";
        created(admin, calendarsAt, "Shift", id, `${calName} · ${row.name}`, after, `Added shift ${row.name} (${row.startTime}–${row.endTime}) to ${calName}`);
      }
      counts.shifts = rows.length;
    }

    const defaultCalendarName = data.calendars[0].name;
    const defaultCalendarId = must(calendarIds, defaultCalendarName.toLowerCase(), "calendar");
    if (tenant.defaultCalendarId !== defaultCalendarId) {
      await tx.tenant.update({ where: { id: tenant.id }, data: { defaultCalendarId } });
      log({
        actor: admin,
        createdAt: calendarsAt,
        entityType: "Tenant",
        entityId: tenant.id,
        entityLabel: "default calendar",
        action: "UPDATE",
        before: { defaultCalendarId: tenant.defaultCalendarId },
        after: { defaultCalendarId },
        summary: `Set default shift calendar to ${defaultCalendarName}`,
      });
    }

    const holiday = demoHolidayDate(today);
    const usedCalendarIds = [...new Set(data.calendars.map((c) => must(calendarIds, c.name.toLowerCase(), "calendar")))];
    const exceptions = await tx.calendarException.createManyAndReturn({
      data: usedCalendarIds.map((calendarId) => ({
        tenantId: tenant.id,
        calendarId,
        date: fromDateOnly(holiday),
        isWorking: false,
        note: data.holidayNote,
        createdAt: at(-20, "11:10"),
      })),
      skipDuplicates: true,
      select: { id: true, calendarId: true, isWorking: true, note: true },
    });
    for (const ex of exceptions) {
      const calName = data.calendars.find((c) => must(calendarIds, c.name.toLowerCase(), "calendar") === ex.calendarId)?.name ?? "calendar";
      created(admin, at(-20, "11:10"), "CalendarException", ex.id, `${calName} · ${holiday}`, { date: holiday, isWorking: ex.isWorking, note: ex.note }, `Added non-working day ${holiday} (${data.holidayNote}) to ${calName}`);
    }
    counts.calendarExceptions = exceptions.length;

    // ---- 6. Machines (reuse by code) --------------------------------------------------------------------------
    const existingMachines = await tx.machine.findMany({ select: { id: true, code: true } });
    const machineIds = new Map(existingMachines.map((m) => [m.code.toUpperCase(), m.id]));
    const newMachines = data.machines.filter((m) => !machineIds.has(m.code.toUpperCase()));
    if (newMachines.length > 0) {
      const rows = await tx.machine.createManyAndReturn({
        data: newMachines.map((m, i) => ({
          tenantId: tenant.id,
          workCenterId: must(workCenterIds, m.workCenter.toUpperCase(), "work center"),
          calendarId: must(calendarIds, m.calendar.toLowerCase(), "calendar"),
          code: m.code,
          name: m.name,
          status: m.status,
          efficiencyPercent: m.efficiencyPercent,
          ratedCapacityPerShift: m.ratedCapacityPerShift ?? null,
          capacityUnit: m.capacityUnit ?? null,
          notes: m.notes ?? null,
          createdAt: at(-27, `10:${pad2(i * 4)}`),
        })),
        select: {
          id: true,
          code: true,
          name: true,
          workCenterId: true,
          calendarId: true,
          status: true,
          efficiencyPercent: true,
          ratedCapacityPerShift: true,
          capacityUnit: true,
          notes: true,
          createdAt: true,
        },
      });
      for (const row of rows) {
        machineIds.set(row.code.toUpperCase(), row.id);
        const { id, createdAt, ...after } = row;
        created(admin, createdAt, "Machine", id, row.code, after, `Created machine ${row.code} · ${row.name}`);
      }
      counts.machines = rows.length;
    }

    // ---- 7. Materials (reuse by code; balances derived below) -------------------------------------------------
    const existingMaterials = await tx.material.findMany({ select: { id: true, code: true, unit: true, stockOnHand: true } });
    type MaterialRef = { id: string; code: string; unit: string; openingBalance: number; isNew: boolean };
    const materials = new Map<string, MaterialRef>(
      existingMaterials.map((m) => [
        m.code.toUpperCase(),
        { id: m.id, code: m.code, unit: m.unit, openingBalance: Number(String(m.stockOnHand)), isNew: false },
      ]),
    );
    const newMaterials = data.materials.filter((m) => !materials.has(m.code.toUpperCase()));

    // Movement plan (chronological) → balances → stockOnHand. Computed BEFORE the insert so new materials are
    // created with their final balance in one statement.
    type PlannedMovement = {
      materialCode: string;
      type: "RECEIPT" | "ISSUE";
      quantity: number;
      reference: string;
      note: string | null;
      createdById: string;
      createdAt: Date;
      actor: AuditActor;
    };
    const planned: PlannedMovement[] = [];
    data.materials.forEach((m, i) => {
      const [first, second] = m.receipts;
      planned.push({
        materialCode: m.code,
        type: "RECEIPT",
        quantity: round3(first),
        reference: `GRN-${String(1001 + i).padStart(4, "0")}`,
        note: m.supplier ? `Delivery from ${m.supplier}` : null,
        createdById: planner.id,
        createdAt: at(-27 + (i % 3), `08:${pad2(30 + i)}`),
        actor: planner,
      });
      planned.push({
        materialCode: m.code,
        type: "RECEIPT",
        quantity: round3(second),
        reference: `GRN-${String(1101 + i).padStart(4, "0")}`,
        note: m.supplier ? `Delivery from ${m.supplier}` : null,
        createdById: planner.id,
        createdAt: at(-13 + (i % 2), `08:${pad2(15 + i)}`),
        actor: planner,
      });
    });

    const productByKey = byKey(data.products, (p) => p.sku.toUpperCase());
    const orderNumbersReserved = reservedOrderNumbers(
      (
        await tx.tenant.update({
          where: { id: tenant.id },
          data: { orderSeq: { increment: data.orders.length } },
          select: { orderSeq: true },
        })
      ).orderSeq,
      data.orders.length,
    );

    data.orders.forEach((o, i) => {
      if (o.startedDaysAgo === undefined) return;
      const product = must(productByKey, o.product.toUpperCase(), "product");
      const orderNumber = orderNumbersReserved[i];
      for (const line of product.bom) {
        const qty = round3(o.quantity * requiredPerUnit(line.quantityPerUnit, line.scrapPercent));
        if (qty <= 0) continue;
        planned.push({
          materialCode: line.material,
          type: "ISSUE",
          quantity: qty,
          reference: orderNumber,
          note: `Issued to ${orderNumber} (${product.sku} × ${o.quantity})`,
          createdById: supervisor.id,
          createdAt: at(-o.startedDaysAgo, `06:${pad2(45 - (i % 5) * 3)}`),
          actor: supervisor,
        });
      }
    });
    planned.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

    const balances = new Map<string, number>();
    for (const m of data.materials) balances.set(m.code.toUpperCase(), materials.get(m.code.toUpperCase())?.openingBalance ?? 0);
    const balanceAfter: number[] = planned.map((mv) => {
      const key = mv.materialCode.toUpperCase();
      const current = balances.get(key);
      if (current === undefined) throw new Error(`Demo dataset is inconsistent: movement for unknown material ${mv.materialCode}`);
      const next = round3(current + (mv.type === "ISSUE" ? -mv.quantity : mv.quantity));
      if (next < 0) throw new Error(`Demo dataset is inconsistent: ${mv.materialCode} would go negative (${next}) at ${mv.reference}`);
      balances.set(key, next);
      return next;
    });

    if (newMaterials.length > 0) {
      const rows = await tx.material.createManyAndReturn({
        data: newMaterials.map((m, i) => ({
          tenantId: tenant.id,
          code: m.code,
          name: m.name,
          unit: m.unit,
          stockOnHand: balances.get(m.code.toUpperCase()) ?? 0,
          reorderThreshold: m.reorderThreshold,
          reorderLeadTimeDays: m.reorderLeadTimeDays,
          unitCost: m.unitCost ?? null,
          supplier: m.supplier ?? null,
          createdAt: at(-27, `11:${pad2(i * 3)}`),
        })),
        select: {
          id: true,
          code: true,
          name: true,
          unit: true,
          reorderThreshold: true,
          reorderLeadTimeDays: true,
          unitCost: true,
          supplier: true,
          isActive: true,
          createdAt: true,
        },
      });
      for (const row of rows) {
        materials.set(row.code.toUpperCase(), { id: row.id, code: row.code, unit: row.unit, openingBalance: 0, isNew: true });
        const { id, createdAt, ...after } = row;
        created(admin, createdAt, "Material", id, row.code, { ...after, stockOnHand: 0 }, `Created material ${row.code} · ${row.name}`);
      }
      counts.materials = rows.length;
    }
    // Reused materials: bring stockOnHand up to the computed final balance.
    for (const m of data.materials) {
      const ref = must(materials, m.code.toUpperCase(), "material");
      if (ref.isNew) continue;
      await tx.material.update({ where: { id: ref.id }, data: { stockOnHand: balances.get(m.code.toUpperCase()) ?? 0 } });
    }

    // ---- 8. Products, BOM, routing ------------------------------------------------------------------------------
    const productRows = await tx.product.createManyAndReturn({
      data: data.products.map((p, i) => ({
        tenantId: tenant.id,
        sku: p.sku,
        name: p.name,
        description: p.description ?? null,
        unit: p.unit,
        createdAt: at(-26, `09:${pad2(i * 6)}`),
      })),
      select: { id: true, sku: true, name: true, description: true, unit: true, isActive: true, createdAt: true },
    });
    const productIds = new Map(productRows.map((p) => [p.sku.toUpperCase(), p.id]));
    for (const row of productRows) {
      const { id, createdAt, ...after } = row;
      created(admin, createdAt, "Product", id, row.sku, after, `Created product ${row.sku} · ${row.name}`);
    }
    counts.products = productRows.length;

    const bomAt = at(-26, "09:40");
    const bomRows = await tx.bomItem.createManyAndReturn({
      data: data.products.flatMap((p) =>
        p.bom.map((line) => ({
          tenantId: tenant.id,
          productId: must(productIds, p.sku.toUpperCase(), "product"),
          materialId: must(materials, line.material.toUpperCase(), "material").id,
          quantityPerUnit: line.quantityPerUnit,
          scrapPercent: line.scrapPercent,
          note: line.note ?? null,
          createdAt: bomAt,
        })),
      ),
      select: { id: true, productId: true, materialId: true, quantityPerUnit: true, scrapPercent: true, note: true },
    });
    const skuByProductId = new Map(productRows.map((p) => [p.id, p.sku]));
    const codeByMaterialId = new Map([...materials.values()].map((m) => [m.id, m.code]));
    for (const row of bomRows) {
      const sku = skuByProductId.get(row.productId) ?? "product";
      const code = codeByMaterialId.get(row.materialId) ?? "material";
      const { id, ...after } = row;
      created(admin, bomAt, "BomItem", id, `${sku} ← ${code}`, after, `Added ${code} to the BOM of ${sku}`);
    }
    counts.bomItems = bomRows.length;

    const routingAt = at(-26, "10:05");
    const opRows = await tx.productOperation.createManyAndReturn({
      data: data.products.flatMap((p) =>
        p.routing.map((op, i) => ({
          tenantId: tenant.id,
          productId: must(productIds, p.sku.toUpperCase(), "product"),
          sequence: (i + 1) * SEQUENCE_STEP,
          workCenterId: must(workCenterIds, op.workCenter.toUpperCase(), "work center"),
          machineId: op.machine ? must(machineIds, op.machine.toUpperCase(), "machine") : null,
          setupMinutes: op.setupMinutes,
          runMinutesPerUnit: op.runMinutesPerUnit,
          createdAt: routingAt,
        })),
      ),
      select: { id: true, productId: true, sequence: true, workCenterId: true, machineId: true, setupMinutes: true, runMinutesPerUnit: true },
    });
    const wcCodeById = new Map([...workCenterIds].map(([code, id]) => [id, code]));
    for (const row of opRows) {
      const sku = skuByProductId.get(row.productId) ?? "product";
      const wc = wcCodeById.get(row.workCenterId) ?? "work center";
      const { id, ...after } = row;
      created(admin, routingAt, "ProductOperation", id, `${sku} · ${row.sequence} ${wc}`, after, `Added routing step ${row.sequence} (${wc}) to ${sku}`);
    }
    counts.operations = opRows.length;

    // ---- 9. Orders (+ status history) ------------------------------------------------------------------------
    const orderRows = await tx.order.createManyAndReturn({
      data: data.orders.map((o, i) => {
        const completed = o.status === "COMPLETED" && o.changedDaysAgo !== undefined;
        return {
          tenantId: tenant.id,
          orderNumber: orderNumbersReserved[i],
          customerId: must(customerIds, customerNameKey(o.customer), "customer"),
          productId: must(productIds, o.product.toUpperCase(), "product"),
          quantity: o.quantity,
          priority: o.priority,
          dueDate: fromDateOnly(addDays(today, o.dueOffset)),
          earliestStartDate: o.dueOffset >= 7 ? fromDateOnly(addDays(today, o.dueOffset - 7)) : null,
          status: o.status,
          completedAt: completed ? at(-(o.changedDaysAgo as number), "16:40") : null,
          customerPoRef: o.customerPoRef ?? null,
          notes: o.notes ?? null,
          createdById: planner.id,
          createdAt: at(-o.createdDaysAgo, `${pad2(9 + (i % 7))}:${pad2((i * 17) % 60)}`),
        };
      }),
      select: {
        id: true,
        orderNumber: true,
        customerId: true,
        productId: true,
        quantity: true,
        priority: true,
        dueDate: true,
        earliestStartDate: true,
        status: true,
        completedAt: true,
        customerPoRef: true,
        notes: true,
        createdAt: true,
      },
    });
    const orderByNumber = byKey(orderRows, (o) => o.orderNumber);
    data.orders.forEach((o, i) => {
      const row = must(orderByNumber, orderNumbersReserved[i], "order");
      const { id, createdAt, completedAt, status, ...rest } = row;
      created(planner, createdAt, "Order", id, row.orderNumber, { ...rest, status: "QUEUED" as OrderStatus, completedAt: null }, `Created order ${row.orderNumber} (${o.product} × ${o.quantity})`);

      const statusChange = (from: OrderStatus, to: OrderStatus, when: Date, by: AuditActor, reason?: string, extra?: Record<string, unknown>) =>
        log({
          actor: by,
          createdAt: when,
          entityType: "Order",
          entityId: id,
          entityLabel: row.orderNumber,
          action: "STATUS_CHANGE",
          before: { status: from },
          after: { status: to, ...(reason ? { reason } : {}), ...(extra ?? {}) },
          summary: reason ? `${transitionSummary(row.orderNumber, from, to)} — ${reason}` : transitionSummary(row.orderNumber, from, to),
        });

      if (o.startedDaysAgo !== undefined) {
        statusChange("QUEUED", "IN_PROGRESS", at(-o.startedDaysAgo, "07:15"), supervisor);
      }
      if (status === "COMPLETED" && o.changedDaysAgo !== undefined) {
        statusChange("IN_PROGRESS", "COMPLETED", completedAt ?? at(-o.changedDaysAgo, "16:40"), supervisor, undefined, {
          completedAt: completedAt ?? null,
        });
      } else if (status === "ON_HOLD" && o.changedDaysAgo !== undefined) {
        statusChange("QUEUED", "ON_HOLD", at(-o.changedDaysAgo, "11:20"), planner, o.reason);
      } else if (status === "CANCELLED" && o.changedDaysAgo !== undefined) {
        statusChange("QUEUED", "CANCELLED", at(-o.changedDaysAgo, "15:05"), planner, o.reason);
      }
    });
    counts.orders = orderRows.length;

    // ---- 10. Stock movements ----------------------------------------------------------------------------------
    const movementRows = await tx.stockMovement.createManyAndReturn({
      data: planned.map((mv, i) => ({
        tenantId: tenant.id,
        materialId: must(materials, mv.materialCode.toUpperCase(), "material").id,
        type: mv.type,
        quantity: mv.type === "ISSUE" ? -mv.quantity : mv.quantity,
        balanceAfter: balanceAfter[i],
        reference: mv.reference,
        note: mv.note,
        createdById: mv.createdById,
        createdAt: mv.createdAt,
      })),
      select: { id: true, materialId: true, type: true, quantity: true, balanceAfter: true, reference: true, note: true, createdAt: true },
    });
    // createManyAndReturn keeps insertion order in Postgres; match on (materialId, createdAt, reference) to be safe.
    const movementKey = (materialId: string, createdAt: Date, reference: string | null) => `${materialId}|${createdAt.getTime()}|${reference ?? ""}`;
    const movementById = new Map(movementRows.map((r) => [movementKey(r.materialId, r.createdAt, r.reference), r]));
    planned.forEach((mv) => {
      const ref = must(materials, mv.materialCode.toUpperCase(), "material");
      const row = movementById.get(movementKey(ref.id, mv.createdAt, mv.reference));
      if (!row) return;
      const signed = Number(String(row.quantity));
      const label = `${mv.type} ${signed > 0 ? "+" : "−"}${Math.abs(signed)} ${ref.unit} ${ref.code}`;
      created(
        mv.actor,
        mv.createdAt,
        "StockMovement",
        row.id,
        label,
        { materialCode: ref.code, type: row.type, quantity: row.quantity, balanceAfter: row.balanceAfter, reference: row.reference, note: row.note },
        `Recorded ${mv.type.toLowerCase()} of ${Math.abs(signed)} ${ref.unit} ${ref.code}${mv.reference ? ` (${mv.reference})` : ""}`,
      );
    });
    counts.stockMovements = movementRows.length;

    // ---- 11. Downtime windows ----------------------------------------------------------------------------------
    const downtimeInputs = data.downtime.map((d) => {
      let startsAt: Date;
      let endsAt: Date;
      if (d.day) {
        startsAt = at(d.day.offset, d.day.start);
        endsAt = at(d.day.offset, d.day.end);
      } else if (d.relativeMinutes) {
        startsAt = new Date(now.getTime() + d.relativeMinutes.start * 60_000);
        endsAt = new Date(now.getTime() + d.relativeMinutes.end * 60_000);
      } else {
        throw new Error(`Demo dataset is inconsistent: downtime on ${d.machine} has no window`);
      }
      const createdAt =
        d.createdDaysAgo !== undefined ? at(-d.createdDaysAgo, "07:50") : new Date(Math.min(startsAt.getTime(), now.getTime()));
      return { spec: d, startsAt, endsAt, createdAt };
    });
    if (downtimeInputs.length > 0) {
      const rows = await tx.downtimeWindow.createManyAndReturn({
        data: downtimeInputs.map((d) => ({
          tenantId: tenant.id,
          machineId: must(machineIds, d.spec.machine.toUpperCase(), "machine"),
          startsAt: d.startsAt,
          endsAt: d.endsAt,
          type: d.spec.type,
          reason: d.spec.reason,
          createdById: supervisor.id,
          createdAt: d.createdAt,
        })),
        select: { id: true, machineId: true, startsAt: true, endsAt: true, type: true, reason: true, createdAt: true },
      });
      const machineCodeById = new Map([...machineIds].map(([code, id]) => [id, code]));
      for (const row of rows) {
        const code = machineCodeById.get(row.machineId) ?? "machine";
        const { id, createdAt, ...after } = row;
        created(supervisor, createdAt, "DowntimeWindow", id, `${code} · ${row.type}`, after, `Added ${row.type.toLowerCase()} window on ${code}${row.reason ? ` — ${row.reason}` : ""}`);
      }
      counts.downtimeWindows = rows.length;
    }

    // ---- 12. Audit rows (batched) + the IMPORT summary row ---------------------------------------------------
    if (auditRows.length > 0) {
      await tx.auditLog.createMany({ data: auditRows });
    }
    const summaryCounts = {
      customers: counts.customers,
      workCenters: counts.workCenters,
      machines: counts.machines,
      materials: counts.materials,
      products: counts.products,
      orders: counts.orders,
      stockMovements: counts.stockMovements,
    };
    // describeAudit() renders this as "{actor} imported Demo data (24 orders, 5 products, …)"; it is a plant-wide
    // event, so it deliberately is NOT a User/Tenant row (those are hidden from roles without audit:read-all).
    await audit(tx, { actor: admin, ip: meta.ip, userAgent: meta.userAgent }, {
      entityType: DEMO_DATA_ENTITY_TYPE,
      entityId: tenant.id,
      entityLabel: `(${counts.orders} orders, ${counts.products} products, ${counts.materials} materials, ${counts.machines} machines)`,
      action: "IMPORT",
      after: { variant, today, ...summaryCounts, orderNumbers: orderNumbersReserved },
      summary: `Loaded demo data: ${counts.orders} orders, ${counts.products} products, ${counts.materials} materials, ${counts.machines} machines, ${counts.customers} customers`,
    });
    counts.auditRows = auditRows.length + 1;

    return { variant, today, defaultCalendarId, orderNumbers: orderNumbersReserved, counts };
  }, TX_OPTIONS);
}

/** Exposed for tests: the dataset a variant seeds. */
export function demoDatasetFor(variant: DemoVariant = "acme"): DemoDataset {
  return demoDataset(variant);
}

/** Type guard used by tests/scripts: a tx-capable scoped client. */
export type DemoTx = TenantTx;
