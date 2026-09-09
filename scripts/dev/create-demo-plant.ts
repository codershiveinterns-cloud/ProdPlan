// Creates the shared one-click demo plant (slug "demo") directly in the database — the same rows the app creates
// on first demo sign-in — so that hosts with a small per-request CPU budget never have to build it inline.
// Usage: DATABASE_URL=postgres://... npx tsx scripts/dev/create-demo-plant.ts
import "dotenv/config";
import { randomBytes } from "node:crypto";

import { prisma, tenantDb } from "../../src/lib/db";
import { hashPassword } from "../../src/lib/auth/password";
import { signupTenant } from "../../src/lib/auth/signup";
import { userSelect } from "../../src/lib/auth/user-dto";
import { seedDemoData } from "../../src/lib/demo/seed-tenant";

const SLUG = "demo";
const DOMAIN = "demo.prodplan.app";
const USERS = [
  { role: "ADMIN", email: `admin@${DOMAIN}`, name: "Priya Sharma" },
  { role: "PLANNER", email: `planner@${DOMAIN}`, name: "Arjun Mehta" },
  { role: "SUPERVISOR", email: `supervisor@${DOMAIN}`, name: "Ravi Kulkarni" },
  { role: "VIEWER", email: `viewer@${DOMAIN}`, name: "Neha Iyer" },
] as const;

async function main() {
  const removed = await prisma.tenant.deleteMany({ where: { slug: SLUG } });
  await prisma.user.deleteMany({ where: { email: { endsWith: `@${DOMAIN}` } } });
  if (removed.count) console.log(`removed ${removed.count} existing demo plant`);

  const [admin, ...rest] = USERS;
  const signup = await signupTenant(
    { company: "Acme Precision Works", timezone: "Asia/Kolkata", name: admin.name, email: admin.email, password: randomBytes(24).toString("base64url") },
    { ip: null, userAgent: "scripts/dev/create-demo-plant" },
  );
  const tenant = await prisma.tenant.update({ where: { id: signup.tenant.id }, data: { slug: SLUG }, select: { id: true, timezone: true, defaultCalendarId: true } });
  const hashes = await Promise.all(rest.map(() => hashPassword(randomBytes(24).toString("base64url"))));
  await prisma.user.createManyAndReturn({
    data: rest.map((u, i) => ({ tenantId: tenant.id, email: u.email, name: u.name, passwordHash: hashes[i], role: u.role })),
    select: userSelect,
  });
  const result = await seedDemoData(tenantDb(tenant.id), tenant, signup.user, { variant: "acme", userAgent: "scripts/dev/create-demo-plant" });
  console.log("demo plant ready:", tenant.id, JSON.stringify(result.counts));
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
