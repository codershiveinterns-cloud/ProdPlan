/**
 * Shared fixtures for the products integration tests: a Session shaped like `requirePermission()` returns,
 * plus raw-client helpers to seed the master data a product module test needs.
 */
import type { Session } from "@/lib/auth/guards";
import { toUserDTO } from "@/lib/auth/user-dto";
import { prisma } from "@/lib/db";
import type { TenantFixture } from "./helpers";

export function sessionFor(fixture: TenantFixture): Session {
  return {
    user: toUserDTO(fixture.admin),
    tenant: {
      id: fixture.tenant.id,
      name: fixture.tenant.name,
      slug: fixture.tenant.slug,
      timezone: fixture.tenant.timezone,
      defaultCalendarId: fixture.tenant.defaultCalendarId,
    },
  };
}

export async function seedMaterial(
  tenantId: string,
  data: { code: string; name?: string; unit?: string; stockOnHand?: number; isActive?: boolean },
) {
  return prisma.material.create({
    data: {
      tenantId,
      code: data.code,
      name: data.name ?? data.code,
      unit: data.unit ?? "kg",
      stockOnHand: data.stockOnHand ?? 0,
      isActive: data.isActive ?? true,
    },
  });
}

export async function seedWorkCenter(tenantId: string, code: string, isActive = true) {
  return prisma.workCenter.create({ data: { tenantId, code, name: `${code} center`, isActive } });
}

export async function seedMachine(
  tenantId: string,
  workCenterId: string,
  calendarId: string,
  code: string,
  status: "ACTIVE" | "INACTIVE" | "MAINTENANCE" = "ACTIVE",
) {
  return prisma.machine.create({ data: { tenantId, workCenterId, calendarId, code, name: `Machine ${code}`, status } });
}
