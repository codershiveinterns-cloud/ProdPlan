/**
 * Formats `BoardWindowDTO` (src/lib/scheduling/queries.ts) into plain, pre-formatted view-model data for the
 * client `GanttBoard` — all date/time formatting happens here, in a function called from the Server Component
 * page, per docs/UI_KIT.md §0 "Formatting happens in Server Components; never format a Date inside a client
 * component." Pixel positions are pure number math (`@/components/schedule/bar-math`, unit-tested) and are safe to
 * compute either side of the RSC boundary — they are computed here too, so the client only ever lays out numbers.
 */
import { TZDate } from "@date-fns/tz";
import type { ConflictSeverity, OperationStatus } from "@/generated/prisma/enums";
import type { BoardMachineDTO, BoardWindowDTO } from "@/lib/scheduling/queries";
import { addDays } from "@/lib/dates";
import { formatDateTime, formatTime } from "@/lib/format";
import { boardWidthPx, dayColumnLeftPx, dayColumnWidthPx, entryLeftPx, entryWidthPx, offsetPx, PX_PER_HOUR } from "@/components/schedule/bar-math";

export type ConflictSummaryVM = { id: string; type: string; severity: ConflictSeverity; message: string };

export type EntryVM = {
  id: string;
  orderId: string;
  orderNumber: string;
  productSku: string;
  productName: string;
  sequence: number;
  machineId: string;
  machineCode: string;
  machineName: string;
  status: OperationStatus;
  locked: boolean;
  conflictSeverity: ConflictSeverity | null;
  plannedStartAt: string;
  plannedEndAt: string;
  windowLabel: string;
  leftPx: number;
  widthPx: number;
  conflicts: ConflictSummaryVM[];
};

export type DowntimeVM = { id: string; leftPx: number; widthPx: number; type: string; label: string };

export type MachineVM = {
  id: string;
  code: string;
  name: string;
  workCenterId: string;
  status: string;
  utilisationPercent: number;
  entries: EntryVM[];
  downtime: DowntimeVM[];
  /** ISO dates (within the window) that are non-working for this machine's calendar. */
  nonWorkingDays: string[];
};

export type WorkCenterVM = { id: string; code: string; name: string; machines: MachineVM[] };

export type DayHeaderVM = { iso: string; weekday: string; dateLabel: string; isToday: boolean };

export type BoardVM = {
  from: string;
  days: number;
  dayHeaders: DayHeaderVM[];
  workCenters: WorkCenterVM[];
  totalWidthPx: number;
  columnWidthPx: number;
  pxPerHour: number;
};

function weekdayShort(iso: string, tz: string): string {
  const d = new TZDate(`${iso}T12:00:00.000Z`, tz);
  return new Intl.DateTimeFormat("en-GB", { timeZone: tz, weekday: "short" }).format(d);
}

function dateLabelShort(iso: string, tz: string): string {
  const d = new TZDate(`${iso}T12:00:00.000Z`, tz);
  return new Intl.DateTimeFormat("en-GB", { timeZone: tz, day: "2-digit", month: "short" }).format(d);
}

function sameCalendarDay(aIso: string, bIso: string, tz: string): boolean {
  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" });
  return fmt.format(new Date(aIso)) === fmt.format(new Date(bIso));
}

function windowLabel(startIso: string, endIso: string, tz: string): string {
  const start = formatDateTime(startIso, tz);
  const end = sameCalendarDay(startIso, endIso, tz) ? formatTime(endIso, tz) : formatDateTime(endIso, tz);
  return `${start} – ${end}`;
}

function buildMachineVM(
  m: BoardMachineDTO,
  windowStartIso: string,
  days: number,
  from: string,
  conflictsByEntry: Map<string, ConflictSummaryVM[]>,
  pxPerHour: number,
): MachineVM {
  const workingDates = new Set(m.shifts.map((s) => s.date));
  const nonWorkingDays: string[] = [];
  for (let i = 0; i < days; i++) {
    const iso = addDays(from, i);
    if (!workingDates.has(iso)) nonWorkingDays.push(iso);
  }

  return {
    id: m.id,
    code: m.code,
    name: m.name,
    workCenterId: m.workCenterId,
    status: m.status,
    utilisationPercent: m.utilisationPercent,
    nonWorkingDays,
    downtime: m.downtime.map((d) => ({
      id: d.id,
      leftPx: offsetPx(windowStartIso, d.startsAt, pxPerHour),
      widthPx: Math.max(2, entryWidthPx(d.startsAt, d.endsAt, pxPerHour)),
      type: d.type,
      label: d.reason ? `${d.type} · ${d.reason}` : d.type,
    })),
    entries: m.entries.map((e) => ({
      id: e.id,
      orderId: e.orderId,
      orderNumber: e.orderNumber,
      productSku: e.productSku,
      productName: e.productName,
      sequence: e.sequence,
      machineId: e.machineId,
      machineCode: m.code,
      machineName: m.name,
      status: e.status,
      locked: e.locked,
      conflictSeverity: e.conflictSeverity,
      plannedStartAt: e.plannedStartAt,
      plannedEndAt: e.plannedEndAt,
      windowLabel: "",
      leftPx: entryLeftPx(windowStartIso, e.plannedStartAt, pxPerHour),
      widthPx: entryWidthPx(e.plannedStartAt, e.plannedEndAt, pxPerHour),
      conflicts: conflictsByEntry.get(e.id) ?? [],
    })),
  };
}

export type BoardConflictRow = { id: string; entryId: string | null; orderId: string | null; type: string; severity: ConflictSeverity; message: string };

/** Builds the client view-model. `conflictRows` — open conflicts touching any entry/order visible in this window. */
export function buildBoardViewModel(board: BoardWindowDTO, tz: string, todayIso: string, conflictRows: BoardConflictRow[], pxPerHour: number = PX_PER_HOUR): BoardVM {
  const windowStartIso = `${board.from}T00:00:00.000Z`;

  const byEntry = new Map<string, ConflictSummaryVM[]>();
  const byOrder = new Map<string, ConflictSummaryVM[]>();
  for (const c of conflictRows) {
    const summary: ConflictSummaryVM = { id: c.id, type: c.type, severity: c.severity, message: c.message };
    if (c.entryId) {
      const list = byEntry.get(c.entryId) ?? [];
      list.push(summary);
      byEntry.set(c.entryId, list);
    } else if (c.orderId) {
      const list = byOrder.get(c.orderId) ?? [];
      list.push(summary);
      byOrder.set(c.orderId, list);
    }
  }

  const dayHeaders: DayHeaderVM[] = [];
  for (let i = 0; i < board.days; i++) {
    const iso = addDays(board.from, i);
    dayHeaders.push({ iso, weekday: weekdayShort(iso, tz), dateLabel: dateLabelShort(iso, tz), isToday: iso === todayIso });
  }

  const workCenters: WorkCenterVM[] = board.workCenters.map((wc) => ({
    id: wc.id,
    code: wc.code,
    name: wc.name,
    machines: wc.machines.map((m) => {
      const vm = buildMachineVM(m, windowStartIso, board.days, board.from, byEntry, pxPerHour);
      // Attach order-level conflicts (no direct entryId) and the formatted window label per entry.
      vm.entries = vm.entries.map((e) => {
        const orderConflicts = byOrder.get(e.orderId) ?? [];
        return {
          ...e,
          conflicts: e.conflicts.length ? e.conflicts : orderConflicts,
          windowLabel: windowLabel(e.plannedStartAt, e.plannedEndAt, tz),
        };
      });
      return vm;
    }),
  }));

  return {
    from: board.from,
    days: board.days,
    dayHeaders,
    workCenters,
    totalWidthPx: boardWidthPx(board.days, pxPerHour),
    columnWidthPx: dayColumnWidthPx(pxPerHour),
    pxPerHour,
  };
}

export { dayColumnLeftPx };
