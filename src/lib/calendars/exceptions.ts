/**
 * Calendar exceptions (docs/M1_SPEC.md §4 "Calendars", §6.3): one row per date (`@@unique([tenantId, calendarId,
 * date])`), `isWorking=false` removes all shifts that day, `isWorking=true` runs all shifts even on a non-working
 * weekday. Dates cross the boundary as `YYYY-MM-DD` strings.
 */
import type { CalendarException } from "@/generated/prisma/client";
import { uniqueViolationFields } from "@/lib/action";
import { audit, auditContext } from "@/lib/audit";
import type { Session } from "@/lib/auth/guards";
import { fromDateOnly, toDateOnly } from "@/lib/dates";
import type { TenantDb, TenantTx } from "@/lib/db";
import { NotFoundError } from "@/lib/errors";
import { formatDate } from "@/lib/format";
import { FieldRuleError } from "@/lib/machines/errors";
import type { CalendarExceptionInput } from "@/lib/validation/calendars";
import { getCalendar } from "./calendars";

export const EXCEPTION_EXISTS_MESSAGE = "An exception for this date already exists";

export type ExceptionWriteInput = Omit<CalendarExceptionInput, "calendarId">;

function snapshot(e: CalendarException) {
  return { calendarId: e.calendarId, date: toDateOnly(e.date), isWorking: e.isWorking, note: e.note };
}

function describe(e: CalendarException): string {
  return `${formatDate(e.date)} (${e.isWorking ? "working" : "non-working"}${e.note ? `: ${e.note}` : ""})`;
}

/** Re-throws the (calendarId, date) unique violation as a field error on `date`. */
function mapUnique(err: unknown): never {
  const fields = uniqueViolationFields(err);
  if (fields.includes("date")) throw new FieldRuleError("date", EXCEPTION_EXISTS_MESSAGE);
  throw err;
}

async function loadException(tx: TenantTx, id: string): Promise<CalendarException> {
  const e = await tx.calendarException.findUnique({ where: { id } });
  if (!e) throw new NotFoundError("Calendar exception not found.");
  return e;
}

export async function addException(
  db: TenantDb,
  session: Session,
  calendarId: string,
  input: ExceptionWriteInput,
): Promise<CalendarException> {
  const ctx = await auditContext(session);
  try {
    return await db.$transaction(async (tx) => {
      const calendar = await getCalendar(tx, calendarId);
      const e = await tx.calendarException.create({
        data: {
          tenantId: session.tenant.id,
          calendarId,
          date: fromDateOnly(input.date),
          isWorking: input.isWorking,
          note: input.note ?? null,
        },
      });
      await audit(tx, ctx, {
        entityType: "CalendarException",
        entityId: e.id,
        entityLabel: `${calendar.name} · ${formatDate(e.date)}`,
        action: "CREATE",
        after: snapshot(e),
        summary: `Added exception ${describe(e)} to calendar ${calendar.name}`,
      });
      return e;
    });
  } catch (err) {
    return mapUnique(err);
  }
}

export async function updateException(
  db: TenantDb,
  session: Session,
  id: string,
  input: ExceptionWriteInput,
): Promise<CalendarException> {
  const ctx = await auditContext(session);
  try {
    return await db.$transaction(async (tx) => {
      const before = await loadException(tx, id);
      const calendar = await getCalendar(tx, before.calendarId);
      const e = await tx.calendarException.update({
        where: { id },
        data: { date: fromDateOnly(input.date), isWorking: input.isWorking, note: input.note ?? null },
      });
      await audit(tx, ctx, {
        entityType: "CalendarException",
        entityId: e.id,
        entityLabel: `${calendar.name} · ${formatDate(e.date)}`,
        action: "UPDATE",
        before: snapshot(before),
        after: snapshot(e),
        summary: `Updated exception ${describe(e)} in calendar ${calendar.name}`,
      });
      return e;
    });
  } catch (err) {
    return mapUnique(err);
  }
}

export async function deleteException(db: TenantDb, session: Session, id: string): Promise<void> {
  const ctx = await auditContext(session);
  await db.$transaction(async (tx) => {
    const e = await loadException(tx, id);
    const calendar = await getCalendar(tx, e.calendarId);
    await tx.calendarException.delete({ where: { id } });
    await audit(tx, ctx, {
      entityType: "CalendarException",
      entityId: e.id,
      entityLabel: `${calendar.name} · ${formatDate(e.date)}`,
      action: "DELETE",
      before: snapshot(e),
      summary: `Removed exception ${describe(e)} from calendar ${calendar.name}`,
    });
  });
}
