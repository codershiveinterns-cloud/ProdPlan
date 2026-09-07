/**
 * Integration: RateLimitBucket-based limiter (docs/M1_SPEC.md §3) against prodplan_test.
 * Skips with a clear message when TEST_DATABASE_URL is unreachable.
 */
import { Client } from "pg";
import { afterAll, describe, expect, it } from "vitest";

const TEST_URL = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
process.env.DATABASE_URL = TEST_URL;

const { prisma } = await import("@/lib/db");
const { hit, cleanupStaleBuckets, resetBucket } = await import("@/lib/rate-limit");

async function dbReachable(): Promise<boolean> {
  if (!TEST_URL) return false;
  const client = new Client({ connectionString: TEST_URL, connectionTimeoutMillis: 2000 });
  try {
    await client.connect();
    await client.query("select 1");
    return true;
  } catch {
    return false;
  } finally {
    await client.end().catch(() => undefined);
  }
}

const reachable = await dbReachable();
if (!reachable) {
  console.warn(`[auth-rate-limit] skipping: TEST_DATABASE_URL (${TEST_URL ?? "unset"}) is unreachable`);
}

const run = Date.now().toString(36);
const keys = [`test:${run}:a`, `test:${run}:b`, `test:${run}:stale`, `test:${run}:parallel`];

describe.skipIf(!reachable)("rate limit buckets", () => {
  afterAll(async () => {
    await prisma.rateLimitBucket.deleteMany({ where: { key: { startsWith: `test:${run}` } } });
    await prisma.$disconnect();
  });

  it("increments per hit and flags the request that exceeds the limit", async () => {
    const key = keys[0]!;
    // Relative to the real clock: the sweep test below expects this bucket to still be "fresh" (< 1 day old).
    const now = new Date();
    const first = await hit(key, 3, 900, now);
    expect(first).toMatchObject({ limited: false, count: 1, limit: 3, remaining: 2 });
    expect(first.resetAt.getTime()).toBe(now.getTime() + 900_000);

    await hit(key, 3, 900, now);
    const third = await hit(key, 3, 900, now);
    expect(third).toMatchObject({ limited: false, count: 3, remaining: 0 });

    const fourth = await hit(key, 3, 900, new Date(now.getTime() + 60_000));
    expect(fourth.limited).toBe(true);
    expect(fourth.count).toBe(4);
    expect(fourth.retryAfterSec).toBe(840);
    expect(fourth.retryAfterMinutes).toBe(14);

    const row = await prisma.rateLimitBucket.findUniqueOrThrow({ where: { key } });
    expect(row.count).toBe(4);
  });

  it("resets the window once resetAt has passed", async () => {
    const key = keys[1]!;
    const start = new Date();
    for (let i = 0; i < 5; i++) await hit(key, 2, 60, start);
    expect((await hit(key, 2, 60, start)).limited).toBe(true);

    const later = new Date(start.getTime() + 61_000);
    const afterReset = await hit(key, 2, 60, later);
    expect(afterReset).toMatchObject({ limited: false, count: 1, remaining: 1 });
    expect(afterReset.resetAt.getTime()).toBe(later.getTime() + 60_000);
  });

  it("counts concurrent hits atomically (upsert increment)", async () => {
    const key = keys[3]!;
    const now = new Date();
    const results = await Promise.all(Array.from({ length: 12 }, () => hit(key, 10, 900, now)));
    const counts = results.map((r) => r.count).sort((a, b) => a - b);
    expect(counts).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(results.filter((r) => r.limited)).toHaveLength(2);
  });

  it("sweeps buckets whose window ended more than a day ago and resetBucket forgets a key", async () => {
    const stale = keys[2]!;
    await prisma.rateLimitBucket.create({
      data: { key: stale, count: 99, resetAt: new Date(Date.now() - 2 * 24 * 3600 * 1000) },
    });
    const removed = await cleanupStaleBuckets();
    expect(removed).toBeGreaterThanOrEqual(1);
    expect(await prisma.rateLimitBucket.findUnique({ where: { key: stale } })).toBeNull();
    // Fresh buckets survive the sweep.
    expect(await prisma.rateLimitBucket.findUnique({ where: { key: keys[0]! } })).not.toBeNull();

    await resetBucket(keys[0]!);
    expect(await prisma.rateLimitBucket.findUnique({ where: { key: keys[0]! } })).toBeNull();
  });
});
