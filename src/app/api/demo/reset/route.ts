/**
 * POST /api/demo/reset — manual reset of the shared demo plant (docs/M1_SPEC.md §6.9).
 * Guarded by DEMO_RESET_TOKEN (header `x-demo-reset-token`); the route answers 404 when the env var is unset so the
 * endpoint does not exist on installs that never configured it. Every visitor's session in the old copy is revoked.
 */
import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { resetDemoPlant } from "@/lib/demo/demo-plant";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

function tokenMatches(given: string | null, expected: string): boolean {
  if (!given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const expected = process.env.DEMO_RESET_TOKEN?.trim();
  if (!expected) {
    return new NextResponse(null, { status: 404 });
  }
  if (!tokenMatches(req.headers.get("x-demo-reset-token"), expected)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }
  try {
    const plant = await resetDemoPlant();
    return NextResponse.json(
      { ok: true, tenantId: plant.id, slug: plant.slug, createdAt: plant.createdAt.toISOString() },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    logger.error("demo plant reset failed", err);
    return NextResponse.json({ ok: false, error: "reset_failed" }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
