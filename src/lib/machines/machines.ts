/**
 * Machines (docs/M1_SPEC.md §4 "Machines & capacity", §6.2): list rows with active-downtime and capacity columns,
 * detail loading, and create/edit/delete with audit rows in the same transaction. `status` is a manual availability
 * flag (INACTIVE = retired, hidden from pickers); downtime windows never change it. `calendarId` is required and
 * pre-filled from the tenant default at create time — switching the default never changes existing machines.
 */
import type { Machine, Prisma } from "@/generated/prisma/client";
import type { MachineStatus } from "@/generated/prisma/enums";
import { audit, auditContext } from "@/lib/audit";
import type { Session } from "@/lib/auth/guards";
import type { TenantDb, TenantTx } from "@/lib/db";
import { NotFoundError } from "@/lib/errors";
import { formatQty, formatTime } from "@/lib/format";
import type { MachineInput } from "@/lib/validation/machines";
import { machineDailyCapacity } from "./capacity";
import { activeDowntimeByMachine } from "./downtime";
import { FieldRuleError, InUseError } from "./errors";
import {
  containsInsensitive,
  firstParam,
  listUrl,
  pageSlice,
  parseFlag,
  parsePage,
  parseQuery,
  parseSort,
  parseSortDir,
  type SearchParams,
  type SortDir,
} from "./list-params";

export const MACHINE_SORT_KEYS = ["code", "name", "workCenter", "status", "calendar"] as const;
export type MachineSortKey = (typeof MACHINE_SORT_KEYS)[number];

const STATUS_VALUES: readonly MachineStatus[] = ["ACTIVE", "INACTIVE", "MAINTENANCE"];

export type MachineListParams = {
  q: string;
  page: number;
  sort: MachineSortKey;
  dir: SortDir;
  workCenterId: string;
  /** "" = any (INACTIVE hidden unless `includeInactive`). */
  status: MachineStatus | "";
  includeInactive: boolean;
  /** Extra filter used by the calendar editor's "Used by n machines" link. */
  calendarId: string;
};

export function parseMachineListParams(sp: SearchParams): MachineListParams {
  const status = firstParam(sp, "status")?.toUpperCase();
  return {
    q: parseQuery(sp),
    page: parsePage(sp),
    sort: parseSort(sp, MACHINE_SORT_KEYS, "code"),
    dir: parseSortDir(sp, "asc"),
    workCenterId: firstParam(sp, "workCenterId") ?? "",
    status: status && (STATUS_VALUES as readonly string[]).includes(status) ? (status as MachineStatus) : "",
    includeInactive: parseFlag(sp, "includeInactive"),
    calendarId: firstParam(sp, "calendarId") ?? "",
  };
}

export function machineListHref(params: MachineListParams, patch: Partial<Omit<MachineListParams, "sort">> & { sort?: string } = {}): string {
  // DataTable hands back the column's sortKey as a plain string; unknown keys fall back to the default.
  const sort = patch.sort !== undefined && (MACHINE_SORT_KEYS as readonly string[]).includes(patch.sort) ? (patch.sort as MachineSortKey) : params.sort;
  const p = { ...params, ...patch, sort };
  return listUrl("/machines", {
    q: p.q,
    page: p.page,
    sort: p.sort === "code" ? "" : p.sort,
    dir: p.sort === "code" && p.dir === "asc" ? "" : p.dir,
    workCenterId: p.workCenterId,
    status: p.status,
    includeInactive: p.includeInactive,
    calendarId: p.calendarId,
  });
}

export function countMachineFilters(params: MachineListParams): number {
  return [params.workCenterId, params.status, params.includeInactive, params.calendarId].filter(Boolean).length;
}

/** Plain row for the /machines table (JSON-safe, pre-formatted). */
export type MachineRow = {
  id: string;
  code: string;
  name: string;
  status: MachineStatus;
  workCenterId: string;
  workCenterCode: string;
  workCenterName: string;
  calendarId: string;
  calendarName: string;
  shiftsPerDay: number;
  /** Standard-day minutes after efficiency (no exceptions/downtime). */
  capacityPerDay: number;
  efficiencyPercent: number;
  /** "120 pcs" or "" */
  ratedOutput: string;
  activeDowntime: { type: "MAINTENANCE" | "BREAKDOWN" | "OTHER"; until: string } | null;
};

function orderBy(sort: MachineSortKey, dir: SortDir): Prisma.MachineOrderByWithRelationInput[] {
  switch (sort) {
    case "name":
      return [{ name: dir }, { code: "asc" }];
    case "workCenter":
      return [{ workCenter: { code: dir } }, { code: "asc" }];
    case "status":
      return [{ status: dir }, { code: "asc" }];
    case "calendar":
      return [{ calendar: { name: dir } }, { code: "asc" }];
    default:
      return [{ code: dir }];
  }
}

export function machineListWhere(params: MachineListParams): Prisma.MachineWhereInput {
  const where: Prisma.MachineWhereInput = {};
  if (params.status) where.status = params.status;
  else if (!params.includeInactive) where.status = { not: "INACTIVE" };
  if (params.workCenterId) where.workCenterId = params.workCenterId;
  if (params.calendarId) where.calendarId = params.calendarId;
  if (params.q) where.OR = [{ code: containsInsensitive(params.q) }, { name: containsInsensitive(params.q) }];
  return where;
}

export function ratedOutputLabel(m: Pick<Machine, "ratedCapacityPerShift" | "capacityUnit">): string {
  if (m.ratedCapacityPerShift === null) return "";
  return formatQty(m.ratedCapacityPerShift, m.capacityUnit);
}

export async function listMachines(
  db: TenantDb,
  params: MachineListParams,
  tz: string,
  now: Date = new Date(),
): Promise<{ rows: MachineRow[]; total: number }> {
  const where = machineListWhere(params);
  const [machines, total] = await Promise.all([
    db.machine.findMany({
      where,
      orderBy: orderBy(params.sort, params.dir),
      ...pageSlice(params.page),
      include: {
        workCenter: { select: { id: true, code: true, name: true } },
        calendar: { select: { id: true, name: true, shifts: true } },
      },
    }),
    db.machine.count({ where }),
  ]);
  const active = await activeDowntimeByMachine(
    db,
    machines.map((m) => m.id),
    now,
  );
  return {
    rows: machines.map((m) => {
      const down = active.get(m.id);
      return {
        id: m.id,
        code: m.code,
        name: m.name,
        status: m.status,
        workCenterId: m.workCenter.id,
        workCenterCode: m.workCenter.code,
        workCenterName: m.workCenter.name,
        calendarId: m.calendar.id,
        calendarName: m.calendar.name,
        shiftsPerDay: m.calendar.shifts.length,
        capacityPerDay: machineDailyCapacity(m, m.calendar),
        efficiencyPercent: m.efficiencyPercent,
        ratedOutput: ratedOutputLabel(m),
        activeDowntime: down ? { type: down.type, until: formatTime(down.endsAt, tz) } : null,
      };
    }),
    total,
  };
}

export type MachineDetail = Prisma.MachineGetPayload<{
  include: {
    workCenter: { select: { id: true; code: true; name: true; isActive: true } };
    calendar: { include: { shifts: true; exceptions: true } };
  };
}>;

export async function getMachineDetail(db: TenantDb, id: string): Promise<MachineDetail | null> {
  return db.machine.findUnique({
    where: { id },
    include: {
      workCenter: { select: { id: true, code: true, name: true, isActive: true } },
      calendar: { include: { shifts: { orderBy: { startTime: "asc" } }, exceptions: true } },
    },
  });
}

export async function getMachine(db: TenantDb, id: string): Promise<Machine> {
  const m = await db.machine.findUnique({ where: { id } });
  if (!m) throw new NotFoundError("Machine not found.");
  return m;
}

/** Routing steps that pin this machine (`ProductOperation.machineId`, NoAction FK). */
export async function machineUsage(db: TenantDb | TenantTx, id: string): Promise<{ operations: number }> {
  const operations = await db.productOperation.count({ where: { machineId: id } });
  return { operations };
}

function snapshot(m: Machine) {
  return {
    workCenterId: m.workCenterId,
    calendarId: m.calendarId,
    code: m.code,
    name: m.name,
    status: m.status,
    efficiencyPercent: m.efficiencyPercent,
    ratedCapacityPerShift: m.ratedCapacityPerShift,
    capacityUnit: m.capacityUnit,
    notes: m.notes,
  };
}

/**
 * The selected work center / calendar must exist in the tenant; they must be active unless unchanged from the
 * row being edited (so an edit of a machine on a retired work center still saves).
 */
async function assertReferences(tx: TenantTx, input: MachineInput, current?: Machine | null): Promise<void> {
  const [wc, cal] = await Promise.all([
    tx.workCenter.findUnique({ where: { id: input.workCenterId }, select: { isActive: true } }),
    tx.shiftCalendar.findUnique({ where: { id: input.calendarId }, select: { isActive: true } }),
  ]);
  if (!wc || (!wc.isActive && current?.workCenterId !== input.workCenterId)) {
    throw new FieldRuleError("workCenterId", "Select an active work center");
  }
  if (!cal || (!cal.isActive && current?.calendarId !== input.calendarId)) {
    throw new FieldRuleError("calendarId", "Select an active shift calendar");
  }
}

function writeData(input: MachineInput) {
  return {
    workCenterId: input.workCenterId,
    calendarId: input.calendarId,
    code: input.code,
    name: input.name,
    status: input.status,
    efficiencyPercent: input.efficiencyPercent,
    ratedCapacityPerShift: input.ratedCapacityPerShift ?? null,
    capacityUnit: input.ratedCapacityPerShift === undefined ? null : (input.capacityUnit ?? null),
    notes: input.notes ?? null,
  };
}

export async function createMachine(db: TenantDb, session: Session, input: MachineInput): Promise<Machine> {
  const ctx = await auditContext(session);
  return db.$transaction(async (tx) => {
    await assertReferences(tx, input);
    const m = await tx.machine.create({ data: { tenantId: session.tenant.id, ...writeData(input) } });
    await audit(tx, ctx, {
      entityType: "Machine",
      entityId: m.id,
      entityLabel: m.code,
      action: "CREATE",
      after: snapshot(m),
      summary: `Created machine ${m.code} (${m.name})`,
    });
    return m;
  });
}

export async function updateMachine(db: TenantDb, session: Session, id: string, input: MachineInput): Promise<Machine> {
  const ctx = await auditContext(session);
  return db.$transaction(async (tx) => {
    const before = await tx.machine.findUnique({ where: { id } });
    if (!before) throw new NotFoundError("Machine not found.");
    await assertReferences(tx, input, before);
    const m = await tx.machine.update({ where: { id }, data: writeData(input) });
    const statusChanged = before.status !== m.status;
    await audit(tx, ctx, {
      entityType: "Machine",
      entityId: m.id,
      entityLabel: m.code,
      action: "UPDATE",
      before: snapshot(before),
      after: snapshot(m),
      summary: statusChanged
        ? `Updated machine ${m.code} (status ${before.status} → ${m.status})`
        : `Updated machine ${m.code}`,
    });
    return m;
  });
}

/** Machine status change only (kebab "Set inactive" / "Set active" / "Set maintenance"). */
export async function setMachineStatus(
  db: TenantDb,
  session: Session,
  id: string,
  status: MachineStatus,
): Promise<Machine> {
  const ctx = await auditContext(session);
  return db.$transaction(async (tx) => {
    const before = await tx.machine.findUnique({ where: { id } });
    if (!before) throw new NotFoundError("Machine not found.");
    const m = await tx.machine.update({ where: { id }, data: { status } });
    await audit(tx, ctx, {
      entityType: "Machine",
      entityId: m.id,
      entityLabel: m.code,
      action: "UPDATE",
      before: snapshot(before),
      after: snapshot(m),
      summary: `Machine ${m.code} status ${before.status} → ${m.status}`,
    });
    return m;
  });
}

/** Hard delete (downtime windows cascade); blocked with `InUseError` while routing steps pin the machine. */
export async function deleteMachine(db: TenantDb, session: Session, id: string): Promise<void> {
  const ctx = await auditContext(session);
  await db.$transaction(async (tx) => {
    const m = await tx.machine.findUnique({ where: { id } });
    if (!m) throw new NotFoundError("Machine not found.");
    const usage = await machineUsage(tx, id);
    if (usage.operations > 0) {
      throw new InUseError(
        `Used by ${usage.operations} routing ${usage.operations === 1 ? "step" : "steps"}. Set its status to Inactive instead.`,
      );
    }
    await tx.machine.delete({ where: { id } });
    await audit(tx, ctx, {
      entityType: "Machine",
      entityId: m.id,
      entityLabel: m.code,
      action: "DELETE",
      before: snapshot(m),
      summary: `Deleted machine ${m.code} (${m.name})`,
    });
  });
}
