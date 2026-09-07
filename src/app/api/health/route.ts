/**
 * GET /api/health → { ok, db, schema, version, time }. Always HTTP 200 (ok:false when the DB is unreachable) so
 * platform health checks can read the body. Never leaks env values, hostnames or error messages.
 */
import { NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import pkg from "../../../../package.json";

export const dynamic = "force-dynamic";

type Health = {
  ok: boolean;
  db: boolean;
  schema: boolean;
  version: string;
  time: string;
};

/** Postgres/Prisma codes that mean "the database answered, but the migrations are not applied". */
const SCHEMA_ERROR_CODES = new Set(["P2021", "P2022", "P2010"]);

export async function GET(): Promise<NextResponse<Health>> {
  let db = false;
  let schema = false;
  try {
    await prisma.tenant.count();
    db = true;
    schema = true;
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && SCHEMA_ERROR_CODES.has(err.code)) {
      db = true;
      schema = false;
    } else {
      db = false;
      schema = false;
    }
  }
  const body: Health = {
    ok: db && schema,
    db,
    schema,
    version: typeof pkg.version === "string" ? pkg.version : "0.0.0",
    time: new Date().toISOString(),
  };
  return NextResponse.json(body, { status: 200, headers: { "Cache-Control": "no-store" } });
}
