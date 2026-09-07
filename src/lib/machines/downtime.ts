/**
 * Downtime / maintenance windows (docs/M1_SPEC.md §4 "Machines & capacity", §6.2). A window never changes
 * `Machine.status`; "active" means `startsAt ≤ now < endsAt`. Overlap with another window on the same machine is a
 * NON-blocking warning: the first save throws `DowntimeOverlapError`, and the caller re-submits with
 * `confirmOverlap: true` to save anyway.
 */
import type { DowntimeWindow, Prisma } from "@/generated/prisma/client";
import type { DowntimeType } from "@/generated/prisma/enums";
import { audit, auditContext } from "@/lib/audit";
import type { Session } from "@/lib/auth/guards";
import { isDowntimeActive } from "@/lib/calendar";
import { parseDateOnly, utcToZonedParts } from "@/lib/dates";
import type { TenantDb, TenantTx } from "@/lib/db";
import { NotFoundError } from "@/lib/errors";
import { formatDateTime } from "@/lib/format";
import type { DowntimeInput } from "@/lib/validation/machines";
import { DowntimeOverlapError } from "./errors";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

const TYPE_LABELS: Record<DowntimeType, string> = {
  MAINTENANCE: "Maintenance",
  BREAKDOWN: "Breakdown",
  OTHER: "Other",
};

export function downtimeTypeLabel(type: DowntimeType): string {
  return TYPE_LABELS[type];
}

function dayMonth(iso: string): string {
  const { month, day } = parseDateOnly(iso);
  return `${String(day).padStart(2, "0")} ${MONTHS[month - 1]}`;
}

/** `10 Sep 08:00–12:00` (same local day) or `10 Sep 22:00 – 11 Sep 06:00`. */
export function formatWindowRange(startsAt: Date | string, endsAt: Date | string, tz: string): string {
  const s = utcToZonedParts(startsAt, tz);
  const e = utcToZonedParts(endsAt, tz);
  if (s.date === e.date) return `${dayMonth(s.date)} ${s.time}–${e.time}`;
  return `${dayMonth(s.date)} ${s.time} – ${dayMonth(e.date)} ${e.time}`;
}

/** "Maintenance 10 Sep 08:00–12:00" — used for overlap warnings and audit labels. */
export function describeWindow(w: Pick<DowntimeWindow, "type" | "startsAt" | "endsAt">, tz: string): string {
  return `${downtimeTypeLabel(w.type)} ${formatWindowRange(w.startsAt, w.endsAt, tz)}`;
}

/** Plain row for the machine detail lists (formatted in the tenant timezone). */
export type DowntimeRow = {
  id: string;
  machineId: string;
  type: DowntimeType;
  reason: string | null;
  /** ISO instants (for the edit dialog's DateTimeInput). */
  startsAt: string;
  endsAt: string;
  startsAtLabel: string;
  endsAtLabel: string;
  /** "10 Sep 08:00–12:00" */
  rangeLabel: string;
  /** `startsAt ≤ now < endsAt` */
  isActive: boolean;
  isPast: boolean;
};

export function toDowntimeRow(w: DowntimeWindow, tz: string, now: Date): DowntimeRow {
  return {
    id: w.id,
    machineId: w.machineId,
    type: w.type,
    reason: w.reason,
    startsAt: w.startsAt.toISOString(),
    endsAt: w.endsAt.toISOString(),
    startsAtLabel: formatDateTime(w.startsAt, tz),
    endsAtLabel: formatDateTime(w.endsAt, tz),
    rangeLabel: formatWindowRange(w.startsAt, w.endsAt, tz),
    isActive: isDowntimeActive(w, now),
    isPast: w.endsAt.getTime() <= now.getTime(),
  };
}

/** Upcoming/active windows (startsAt asc) and past windows (most recent first) for one machine. */
export async function listDowntime(
  db: TenantDb,
  machineId: string,
  tz: string,
  now: Date = new Date(),
): Promise<{ upcoming: DowntimeRow[]; past: DowntimeRow[]; all: DowntimeWindow[] }> {
  const all = await db.downtimeWindow.findMany({ where: { machineId }, orderBy: { startsAt: "asc" } });
  const rows = all.map((w) => toDowntimeRow(w, tz, now));
  return {
    upcoming: rows.filter((r) => !r.isPast),
    past: rows.filter((r) => r.isPast).reverse(),
    all,
  };
}

/** The window covering `now` on each of `machineIds` (one query); the earliest-ending one wins per machine. */
export async function activeDowntimeByMachine(
  db: TenantDb,
  machineIds: readonly string[],
  now: Date = new Date(),
): Promise<Map<string, DowntimeWindow>> {
  const out = new Map<string, DowntimeWindow>();
  if (machineIds.length === 0) return out;
  const windows = await db.downtimeWindow.findMany({
    where: { machineId: { in: [...machineIds] }, startsAt: { lte: now }, endsAt: { gt: now } },
    orderBy: { endsAt: "asc" },
  });
  for (const w of windows) if (!out.has(w.machineId)) out.set(w.machineId, w);
  return out;
}

/** Half-open interval overlap: `[aStart, aEnd) ∩ [bStart, bEnd) ≠ ∅`. */
export function windowsOverlap(
  a: { startsAt: Date; endsAt: Date },
  b: { startsAt: Date; endsAt: Date },
): boolean {
  return a.startsAt.getTime() < b.endsAt.getTime() && b.startsAt.getTime() < a.endsAt.getTime();
}

async function findOverlaps(
  tx: TenantTx,
  machineId: string,
  startsAt: Date,
  endsAt: Date,
  excludeId?: string,
): Promise<DowntimeWindow[]> {
  return tx.downtimeWindow.findMany({
    where: {
      machineId,
      startsAt: { lt: endsAt },
      endsAt: { gt: startsAt },
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    orderBy: { startsAt: "asc" },
  });
}

function snapshot(w: DowntimeWindow) {
  return { machineId: w.machineId, type: w.type, startsAt: w.startsAt, endsAt: w.endsAt, reason: w.reason };
}

export type DowntimeWriteInput = Omit<DowntimeInput, "machineId"> & { confirmOverlap?: boolean };

async function loadMachineCode(tx: TenantTx, machineId: string): Promise<string> {
  const machine = await tx.machine.findUnique({ where: { id: machineId }, select: { code: true } });
  if (!machine) throw new NotFoundError("Machine not found.");
  return machine.code;
}

export async function createDowntime(
  db: TenantDb,
  session: Session,
  machineId: string,
  input: DowntimeWriteInput,
): Promise<DowntimeWindow> {
  const ctx = await auditContext(session);
  const tz = session.tenant.timezone;
  return db.$transaction(async (tx) => {
    const machineCode = await loadMachineCode(tx, machineId);
    if (!input.confirmOverlap) {
      const overlaps = await findOverlaps(tx, machineId, input.startsAt, input.endsAt);
      if (overlaps.length > 0) throw new DowntimeOverlapError(overlaps.map((w) => describeWindow(w, tz)));
    }
    const w = await tx.downtimeWindow.create({
      data: {
        tenantId: session.tenant.id,
        machineId,
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        type: input.type,
        reason: input.reason ?? null,
        createdById: session.user.id,
      },
    });
    await audit(tx, ctx, {
      entityType: "DowntimeWindow",
      entityId: w.id,
      entityLabel: `${machineCode} · ${describeWindow(w, tz)}`,
      action: "CREATE",
      after: snapshot(w),
      summary: `Added downtime on ${machineCode}: ${describeWindow(w, tz)}`,
    });
    return w;
  });
}

export async function updateDowntime(
  db: TenantDb,
  session: Session,
  id: string,
  input: DowntimeWriteInput,
): Promise<DowntimeWindow> {
  const ctx = await auditContext(session);
  const tz = session.tenant.timezone;
  return db.$transaction(async (tx) => {
    const before = await tx.downtimeWindow.findUnique({ where: { id } });
    if (!before) throw new NotFoundError("Downtime window not found.");
    const machineCode = await loadMachineCode(tx, before.machineId);
    if (!input.confirmOverlap) {
      const overlaps = await findOverlaps(tx, before.machineId, input.startsAt, input.endsAt, id);
      if (overlaps.length > 0) throw new DowntimeOverlapError(overlaps.map((w) => describeWindow(w, tz)));
    }
    const w = await tx.downtimeWindow.update({
      where: { id },
      data: { startsAt: input.startsAt, endsAt: input.endsAt, type: input.type, reason: input.reason ?? null },
    });
    await audit(tx, ctx, {
      entityType: "DowntimeWindow",
      entityId: w.id,
      entityLabel: `${machineCode} · ${describeWindow(w, tz)}`,
      action: "UPDATE",
      before: snapshot(before),
      after: snapshot(w),
      summary: `Updated downtime on ${machineCode}: ${describeWindow(w, tz)}`,
    });
    return w;
  });
}

export async function deleteDowntime(db: TenantDb, session: Session, id: string): Promise<DowntimeWindow> {
  const ctx = await auditContext(session);
  const tz = session.tenant.timezone;
  return db.$transaction(async (tx) => {
    const w = await tx.downtimeWindow.findUnique({ where: { id } });
    if (!w) throw new NotFoundError("Downtime window not found.");
    const machineCode = await loadMachineCode(tx, w.machineId);
    await tx.downtimeWindow.delete({ where: { id } });
    await audit(tx, ctx, {
      entityType: "DowntimeWindow",
      entityId: w.id,
      entityLabel: `${machineCode} · ${describeWindow(w, tz)}`,
      action: "DELETE",
      before: snapshot(w),
      summary: `Removed downtime on ${machineCode}: ${describeWindow(w, tz)}`,
    });
    return w;
  });
}

/** Audit rows for a machine and its downtime windows (deleted windows included via the JSON snapshots). */
export function machineAuditWhere(machineId: string): Prisma.AuditLogWhereInput {
  return {
    OR: [
      { entityType: "Machine", entityId: machineId },
      { entityType: "DowntimeWindow", after: { path: ["machineId"], equals: machineId } },
      { entityType: "DowntimeWindow", before: { path: ["machineId"], equals: machineId } },
    ],
  };
}
