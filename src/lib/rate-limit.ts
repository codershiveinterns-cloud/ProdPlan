/**
 * Fixed-window rate limiting on the platform-level `RateLimitBucket` table (docs/M1_SPEC.md §3).
 * One `upsert` per hit, so it is correct across serverless instances. This is one of the few modules allowed to
 * use the raw (unscoped) Prisma client — `RateLimitBucket` has no tenantId.
 */
import { createHash } from "node:crypto";
import { prisma } from "@/lib/db";

export type RateLimitResult = {
  /** True when this hit exceeded `limit` inside the current window. */
  limited: boolean;
  count: number;
  limit: number;
  remaining: number;
  resetAt: Date;
  /** Whole seconds until the window resets (≥ 1 while limited). */
  retryAfterSec: number;
  retryAfterMinutes: number;
};

export const RATE_LIMITS = {
  loginIp: { limit: 20, windowSec: 15 * 60 },
  loginEmail: { limit: 10, windowSec: 15 * 60 },
  signupIp: { limit: 5, windowSec: 60 * 60 },
} as const;

const STALE_AFTER_MS = 24 * 60 * 60 * 1000;
/** Probability (per hit) of sweeping buckets whose window ended more than a day ago. */
const CLEANUP_PROBABILITY = 0.02;

export function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

export function loginIpKey(ip: string): string {
  return `login:ip:${ip}`;
}

export function loginEmailKey(normalizedEmail: string): string {
  return `login:email:${sha256(normalizedEmail)}`;
}

export function signupIpKey(ip: string): string {
  return `signup:ip:${ip}`;
}

/**
 * Client IP: Netlify's `x-nf-client-connection-ip`, else the LAST hop of `x-forwarded-for` (the one appended by
 * the trusted edge), else "unknown".
 */
export function clientIp(headers: Headers): string {
  const nf = headers.get("x-nf-client-connection-ip")?.trim();
  if (nf) return nf.slice(0, 64);
  const xff = headers.get("x-forwarded-for");
  if (xff) {
    const hops = xff
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const last = hops.at(-1);
    if (last) return last.slice(0, 64);
  }
  const real = headers.get("x-real-ip")?.trim();
  if (real) return real.slice(0, 64);
  return "unknown";
}

function toResult(count: number, limit: number, resetAt: Date, now: Date): RateLimitResult {
  const retryAfterSec = Math.max(1, Math.ceil((resetAt.getTime() - now.getTime()) / 1000));
  return {
    limited: count > limit,
    count,
    limit,
    remaining: Math.max(0, limit - count),
    resetAt,
    retryAfterSec,
    retryAfterMinutes: Math.max(1, Math.ceil(retryAfterSec / 60)),
  };
}

/**
 * Records one attempt for `key` and reports whether the caller is over `limit` for the current window.
 * `upsert` (create `{count:1,resetAt}` / update `{count:{increment:1}}`), then a reset when the window has passed.
 */
export async function hit(key: string, limit: number, windowSec: number, now: Date = new Date()): Promise<RateLimitResult> {
  const windowEnd = new Date(now.getTime() + windowSec * 1000);
  let row = await prisma.rateLimitBucket.upsert({
    where: { key },
    create: { key, count: 1, resetAt: windowEnd },
    update: { count: { increment: 1 } },
  });
  if (row.resetAt.getTime() < now.getTime()) {
    row = await prisma.rateLimitBucket.update({
      where: { key },
      data: { count: 1, resetAt: windowEnd },
    });
  }
  if (Math.random() < CLEANUP_PROBABILITY) {
    await cleanupStaleBuckets(now).catch(() => undefined);
  }
  return toResult(row.count, limit, row.resetAt, now);
}

/** Deletes buckets whose window ended more than a day ago. Safe to call any time. */
export async function cleanupStaleBuckets(now: Date = new Date()): Promise<number> {
  const res = await prisma.rateLimitBucket.deleteMany({
    where: { resetAt: { lt: new Date(now.getTime() - STALE_AFTER_MS) } },
  });
  return res.count;
}

/** Test/admin helper: forget one key. */
export async function resetBucket(key: string): Promise<void> {
  await prisma.rateLimitBucket.deleteMany({ where: { key } });
}

/** "Too many attempts, try again in N minutes" — appended to the generic auth error when limited. */
export function tooManyAttemptsMessage(result: RateLimitResult): string {
  const n = result.retryAfterMinutes;
  return `Too many attempts, try again in ${n} minute${n === 1 ? "" : "s"}.`;
}
