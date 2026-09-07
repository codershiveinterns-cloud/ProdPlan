/**
 * Dev tool: mint a session cookie for an existing user without knowing their password.
 *
 *   npx tsx scripts/mint-session.ts admin@acme.test
 *
 * Prints a `Set-Cookie` value plus a ready-to-paste curl `Cookie:` header. Refuses to run in production
 * (NODE_ENV=production) or against a non-local database host.
 */
import "dotenv/config";

function fail(message: string): never {
  process.stderr.write(`mint-session: ${message}\n`);
  process.exit(1);
}

function dbHost(): string | null {
  const url = process.env.DATABASE_URL ?? process.env.NETLIFY_DB_URL;
  if (!url) return null;
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

async function main(): Promise<void> {
  if (process.env.NODE_ENV === "production") fail("refusing to run with NODE_ENV=production");
  const host = dbHost();
  if (!host) fail("DATABASE_URL is not set");
  if (host !== "127.0.0.1" && host !== "localhost" && host !== "::1") {
    fail(`refusing to mint sessions against a non-local database host (${host})`);
  }

  const email = process.argv[2]?.trim().toLowerCase();
  if (!email) fail("usage: npx tsx scripts/mint-session.ts <email>");

  // Imported lazily so the guards above run before any DB connection is attempted.
  const [{ prisma }, jwt] = await Promise.all([import("../src/lib/db"), import("../src/lib/auth/jwt")]);

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, tenantId: true, role: true, tokenVersion: true, isActive: true, name: true },
  });
  if (!user) fail(`no user with email ${email}`);
  if (!user.isActive) fail(`user ${email} is deactivated`);

  const token = await jwt.signSessionToken({
    userId: user.id,
    tenantId: user.tenantId,
    role: user.role,
    tokenVersion: user.tokenVersion,
  });
  const name = jwt.sessionCookieName();
  const opts = jwt.sessionCookieOptions();
  const attrs = [`Path=${opts.path}`, `Max-Age=${opts.maxAge}`, "HttpOnly", "SameSite=Lax", ...(opts.secure ? ["Secure"] : [])];

  process.stdout.write(`# session for ${user.name} <${email}> (${user.role}), valid ${Math.round(opts.maxAge / 86400)} days\n`);
  process.stdout.write(`Set-Cookie: ${name}=${token}; ${attrs.join("; ")}\n\n`);
  process.stdout.write(`# curl example\ncurl -s -H 'Cookie: ${name}=${token}' ${jwt.appOrigin()}/dashboard\n`);
  await prisma.$disconnect();
}

main().catch((err: unknown) => {
  fail(err instanceof Error ? err.message : String(err));
});
