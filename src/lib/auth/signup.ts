/**
 * Tenant signup (docs/M1_SPEC.md §2, §3): ONE transaction creates the Tenant, its first ADMIN user, a
 * "General shift" calendar with one 09:00–17:00 Mon–Sat shift (60-min break) and sets `defaultCalendarId`.
 * Slug collisions retry with `-2`, `-3` … up to 5 attempts. Runs on the raw client (auth is an allowed raw user).
 */
import type { Prisma } from "@/generated/prisma/client";
import { uniqueViolationFields } from "@/lib/action";
import { prisma } from "@/lib/db";
import { DomainError } from "@/lib/errors";
import { hashPassword, normalizeEmail } from "@/lib/auth/password";
import { slugCandidate, slugify, SLUG_MAX_ATTEMPTS } from "@/lib/auth/slug";
import { tenantSelect, type SessionTenant } from "@/lib/auth/session";
import { userSelect, type UserDTO } from "@/lib/auth/user-dto";

export const EMAIL_TAKEN_MESSAGE = "An account with this email already exists";

export class EmailTakenError extends DomainError {
  constructor() {
    super(EMAIL_TAKEN_MESSAGE, "email_taken", 409);
  }
}

export type SignupData = {
  company: string;
  timezone: string;
  name: string;
  email: string;
  password: string;
};

export type SignupContext = { ip?: string | null; userAgent?: string | null };

export type SignupResult = {
  tenant: SessionTenant;
  user: UserDTO;
  tokenVersion: number;
  calendarId: string;
};

export const DEFAULT_CALENDAR_NAME = "General shift";
export const DEFAULT_SHIFT = {
  name: "Day",
  startTime: "09:00",
  endTime: "17:00",
  daysOfWeek: [1, 2, 3, 4, 5, 6],
  breakMinutes: 60,
} as const;

/** JSON-safe copy for AuditLog.before/after (Dates → ISO strings, no undefined). */
function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export async function signupTenant(data: SignupData, ctx: SignupContext = {}): Promise<SignupResult> {
  const email = normalizeEmail(data.email);
  const company = data.company.trim();
  const name = data.name.trim();

  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (existing) throw new EmailTakenError();

  const passwordHash = await hashPassword(data.password);
  const base = slugify(company);

  for (let attempt = 1; attempt <= SLUG_MAX_ATTEMPTS; attempt++) {
    const slug = slugCandidate(base, attempt);
    try {
      return await prisma.$transaction(async (tx) => {
        const tenant = await tx.tenant.create({
          data: { name: company, slug, timezone: data.timezone },
          select: { id: true },
        });
        const user = await tx.user.create({
          data: { tenantId: tenant.id, email, name, passwordHash, role: "ADMIN" },
          select: { ...userSelect, tokenVersion: true },
        });
        const calendar = await tx.shiftCalendar.create({
          data: { tenantId: tenant.id, name: DEFAULT_CALENDAR_NAME },
          select: { id: true, name: true, isActive: true },
        });
        const shift = await tx.shift.create({
          data: {
            tenantId: tenant.id,
            calendarId: calendar.id,
            name: DEFAULT_SHIFT.name,
            startTime: DEFAULT_SHIFT.startTime,
            endTime: DEFAULT_SHIFT.endTime,
            daysOfWeek: [...DEFAULT_SHIFT.daysOfWeek],
            breakMinutes: DEFAULT_SHIFT.breakMinutes,
          },
          select: { id: true, name: true, startTime: true, endTime: true, daysOfWeek: true, breakMinutes: true },
        });
        const updatedTenant = await tx.tenant.update({
          where: { id: tenant.id },
          data: { defaultCalendarId: calendar.id },
          select: tenantSelect,
        });

        const { tokenVersion, ...userDto } = user;
        const actor = {
          actorUserId: user.id,
          actorEmail: user.email,
          actorName: user.name,
          ip: ctx.ip ?? null,
          userAgent: ctx.userAgent ?? null,
        };
        const tenantAfter = { name: updatedTenant.name, slug: updatedTenant.slug, timezone: updatedTenant.timezone, defaultCalendarId: calendar.id };
        const userAfter = { email: userDto.email, name: userDto.name, role: userDto.role, isActive: userDto.isActive };
        const calendarAfter = { name: calendar.name, isActive: calendar.isActive, shifts: [shift] };
        await tx.auditLog.createMany({
          data: [
            {
              tenantId: tenant.id,
              ...actor,
              entityType: "Tenant",
              entityId: tenant.id,
              entityLabel: company,
              action: "CREATE",
              summary: `Created tenant ${company}`,
              changedFields: Object.keys(tenantAfter),
              after: toJson(tenantAfter),
            },
            {
              tenantId: tenant.id,
              ...actor,
              entityType: "User",
              entityId: user.id,
              entityLabel: user.email,
              action: "CREATE",
              summary: `Created user ${user.name} (${user.email}) as Admin`,
              changedFields: Object.keys(userAfter),
              after: toJson(userAfter),
            },
            {
              tenantId: tenant.id,
              ...actor,
              entityType: "ShiftCalendar",
              entityId: calendar.id,
              entityLabel: calendar.name,
              action: "CREATE",
              summary: `Created shift calendar ${calendar.name} (default)`,
              changedFields: Object.keys(calendarAfter),
              after: toJson(calendarAfter),
            },
          ],
        });

        return { tenant: updatedTenant, user: userDto, tokenVersion, calendarId: calendar.id };
      });
    } catch (err) {
      // P2002 → which unique index? (`User_email_key` / `Tenant_slug_key`; shape differs per Prisma driver)
      const fields = uniqueViolationFields(err);
      if (fields.includes("email")) throw new EmailTakenError();
      if (fields.includes("slug") && attempt < SLUG_MAX_ATTEMPTS) continue;
      throw err;
    }
  }
  throw new DomainError("We could not create a unique workspace for that company name. Please try a slightly different name.");
}
