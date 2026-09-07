/**
 * Last-admin guard (docs/M1_SPEC.md §3). Every user-management mutation runs in one `db.$transaction` that
 * FIRST touches the Tenant row (`lockTenantRow`) — the row-level lock serialises admin mutations per tenant — then
 * performs the change and finally calls `assertAdminRemains` (throws `LastAdminError` → rollback).
 * Concurrent demotions therefore queue on the lock and the second one sees the first one's commit
 * (tests/integration/users-manage.test.ts "parallel demotions").
 */
import type { TenantTx } from "@/lib/db";
import { LastAdminError } from "./errors";

/** Takes the tenant row lock for the rest of the transaction. Must be the FIRST statement of the transaction. */
export async function lockTenantRow(tx: TenantTx, tenantId: string): Promise<void> {
  await tx.tenant.update({ where: { id: tenantId }, data: { updatedAt: new Date() }, select: { id: true } });
}

/** Throws `LastAdminError` unless at least one active ADMIN exists in the (scoped) tenant. */
export async function assertAdminRemains(tx: TenantTx): Promise<void> {
  const admins = await tx.user.count({ where: { role: "ADMIN", isActive: true } });
  if (admins < 1) throw new LastAdminError();
}
