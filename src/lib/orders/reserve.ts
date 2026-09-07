/**
 * Automatic order-number reservation (docs/M1_SPEC.md §4 "Orders").
 *
 * `reserveOrderNumbers(tx, tenantId, n)` bumps `Tenant.orderSeq` by `n` in ONE statement through the scoped
 * transaction client and returns `n` free `SO-%06d` numbers. Numbers that already exist in the tenant (inserted
 * outside the sequence by seeds or migrations) are detected with one `findMany` and replaced by reserving further
 * numbers, up to 5 rounds — the retry rule. Because a unique violation would abort the surrounding Postgres
 * transaction (and roll the increment back, so the same collision would recur), the P2002 fallback for a true
 * concurrent race is applied around the WHOLE transaction with `withOrderNumberRetry()`.
 */
import { isPrismaKnownError, uniqueViolationFields } from "@/lib/action";
import type { TenantDb, TenantTx } from "@/lib/db";
import { DomainError } from "@/lib/errors";
import { reservedOrderNumbers } from "@/lib/orders/numbers";

export const ORDER_NUMBER_MAX_ATTEMPTS = 5;

/** Reserves `n` automatic order numbers that do not exist yet. `n = 0` reserves nothing and returns `[]`. */
export async function reserveOrderNumbers(tx: TenantTx | TenantDb, tenantId: string, n: number): Promise<string[]> {
  if (!Number.isInteger(n) || n < 0) throw new RangeError(`reserveOrderNumbers: invalid count ${String(n)}`);
  if (n === 0) return [];
  const free: string[] = [];
  let needed = n;
  for (let attempt = 1; attempt <= ORDER_NUMBER_MAX_ATTEMPTS; attempt++) {
    const { orderSeq } = await tx.tenant.update({
      where: { id: tenantId },
      data: { orderSeq: { increment: needed } },
      select: { orderSeq: true },
    });
    const candidates = reservedOrderNumbers(orderSeq, needed);
    const taken = new Set(
      (await tx.order.findMany({ where: { orderNumber: { in: candidates } }, select: { orderNumber: true } })).map((o) => o.orderNumber),
    );
    for (const c of candidates) if (!taken.has(c)) free.push(c);
    needed = n - free.length;
    if (needed === 0) return free;
  }
  throw new DomainError("Could not allocate automatic order numbers — please try again", "order_number_exhausted", 409);
}

/** True for a Prisma P2002 whose unique constraint involves `orderNumber`. */
export function isOrderNumberConflict(err: unknown): boolean {
  return isPrismaKnownError(err) && err.code === "P2002" && uniqueViolationFields(err).includes("orderNumber");
}

/**
 * Runs `fn` and re-runs it (fresh transaction, fresh reservation) when it fails with a P2002 on `orderNumber`,
 * up to `attempts` times. Any other error is rethrown immediately.
 */
export async function withOrderNumberRetry<T>(
  fn: (attempt: number) => Promise<T>,
  attempts: number = ORDER_NUMBER_MAX_ATTEMPTS,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn(attempt);
    } catch (err) {
      if (!isOrderNumberConflict(err) || attempt === attempts) throw err;
      lastError = err;
    }
  }
  throw lastError;
}
