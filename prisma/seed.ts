/**
 * Demo seed (docs/M1_SPEC.md §7). Run with `npx prisma db seed` (or `npx tsx prisma/seed.ts`).
 *
 *  - Refuses unless DATABASE_URL points at 127.0.0.1 / localhost / ::1, or SEED_ALLOW=1 is set (staging).
 *  - Idempotent: deletes the tenants with slugs `acme` and `beta` (FK cascades remove everything they own) and
 *    recreates them.
 *  - Creates each tenant exactly like signup does (`signupTenant()`: tenant + ADMIN + "General shift" calendar +
 *    audit rows, bcrypt cost 12), renames the slug to the fixed demo slug, adds the extra demo users, then loads
 *    the demo plant through `seedDemoData()` using the tenant-scoped client — the same code path as the
 *    dashboard's "Load demo data" button.
 *
 * Demo credentials are public (Password123!) — rotate them before entering real data (see docs/HANDOVER_M1.md).
 */
import "dotenv/config";

import { prisma, tenantDb } from "../src/lib/db";
import { hashPassword } from "../src/lib/auth/password";
import { signupTenant } from "../src/lib/auth/signup";
import { userSelect, type UserDTO } from "../src/lib/auth/user-dto";
import { DEMO_PASSWORD, DEMO_TENANTS, type DemoTenantSpec } from "../src/lib/demo/demo-data";
import { seedDemoData, type SeedDemoCounts } from "../src/lib/demo/seed-tenant";

const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

function connectionHost(): string | null {
  const url = process.env.DATABASE_URL ?? process.env.NETLIFY_DB_URL;
  if (!url) return null;
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

function assertSeedAllowed(): void {
  const host = connectionHost();
  if (!host) {
    throw new Error("seed: DATABASE_URL (or NETLIFY_DB_URL) is not set");
  }
  if (process.env.SEED_ALLOW === "1") return;
  if (!LOCAL_HOSTS.has(host)) {
    throw new Error(
      `seed: refusing to seed a non-local database (${host}). Set SEED_ALLOW=1 to seed staging deliberately.`,
    );
  }
}

async function deleteDemoTenants(slugs: string[], emails: string[]): Promise<number> {
  const { count } = await prisma.tenant.deleteMany({ where: { slug: { in: slugs } } });
  // A demo email that still exists belongs to a tenant with another slug — never delete someone else's tenant.
  const leftovers = await prisma.user.findMany({ where: { email: { in: emails } }, select: { email: true, tenant: { select: { slug: true } } } });
  if (leftovers.length > 0) {
    const list = leftovers.map((u) => `${u.email} (tenant ${u.tenant.slug})`).join(", ");
    throw new Error(`seed: demo emails are already taken outside the demo tenants: ${list}`);
  }
  return count;
}

type SeededTenant = {
  spec: DemoTenantSpec;
  tenantId: string;
  counts: SeedDemoCounts;
  userCount: number;
  orderNumbers: string[];
};

async function seedTenant(spec: DemoTenantSpec, passwordHash: string): Promise<SeededTenant> {
  const [adminSpec, ...extraUsers] = spec.users;
  if (!adminSpec || adminSpec.role !== "ADMIN") throw new Error(`seed: the first user of ${spec.slug} must be the ADMIN`);

  // Exactly what the signup form does (one transaction: tenant, admin, "General shift", default calendar, audit).
  const signup = await signupTenant(
    { company: spec.name, timezone: spec.timezone, name: adminSpec.name, email: adminSpec.email, password: DEMO_PASSWORD },
    { ip: null, userAgent: "prisma/seed" },
  );
  const tenant = await prisma.tenant.update({
    where: { id: signup.tenant.id },
    data: { slug: spec.slug },
    select: { id: true, timezone: true, defaultCalendarId: true },
  });

  // Extra users (planner / supervisor / viewer) with the same demo password, plus their CREATE audit rows.
  if (extraUsers.length > 0) {
    const created = await prisma.user.createManyAndReturn({
      data: extraUsers.map((u) => ({
        tenantId: tenant.id,
        email: u.email.toLowerCase(),
        name: u.name,
        passwordHash,
        role: u.role,
      })),
      select: userSelect,
    });
    await prisma.auditLog.createMany({
      data: created.map((u) => ({
        tenantId: tenant.id,
        actorUserId: signup.user.id,
        actorEmail: signup.user.email,
        actorName: signup.user.name,
        userAgent: "prisma/seed",
        entityType: "User",
        entityId: u.id,
        entityLabel: u.email,
        action: "CREATE",
        summary: `Invited user ${u.name} (${u.email}) as ${u.role.charAt(0) + u.role.slice(1).toLowerCase()}`,
        changedFields: ["email", "name", "role", "isActive"],
        after: { email: u.email, name: u.name, role: u.role, isActive: u.isActive },
      })),
    });
  }

  const admin: UserDTO = signup.user;
  const result = await seedDemoData(tenantDb(tenant.id), tenant, admin, { variant: spec.variant, userAgent: "prisma/seed" });

  return { spec, tenantId: tenant.id, counts: result.counts, userCount: spec.users.length, orderNumbers: result.orderNumbers };
}

/** Independent re-count from the database, so the printed table reflects what is actually stored. */
async function verifyCounts(tenantId: string): Promise<Record<string, number>> {
  const where = { tenantId };
  const [users, customers, workCenters, calendars, shifts, exceptions, machines, materials, products, bomItems, operations, orders, movements, downtime, auditRows] =
    await Promise.all([
      prisma.user.count({ where }),
      prisma.customer.count({ where }),
      prisma.workCenter.count({ where }),
      prisma.shiftCalendar.count({ where }),
      prisma.shift.count({ where }),
      prisma.calendarException.count({ where }),
      prisma.machine.count({ where }),
      prisma.material.count({ where }),
      prisma.product.count({ where }),
      prisma.bomItem.count({ where }),
      prisma.productOperation.count({ where }),
      prisma.order.count({ where }),
      prisma.stockMovement.count({ where }),
      prisma.downtimeWindow.count({ where }),
      prisma.auditLog.count({ where }),
    ]);
  return { users, customers, workCenters, calendars, shifts, exceptions, machines, materials, products, bomItems, operations, orders, movements, downtime, auditRows };
}

function printTable(rows: Record<string, string | number>[]): void {
  if (rows.length === 0) return;
  const keys = Object.keys(rows[0]);
  const widths = keys.map((k) => Math.max(k.length, ...rows.map((r) => String(r[k]).length)));
  const line = (cells: string[]) => `| ${cells.map((c, i) => c.padEnd(widths[i])).join(" | ")} |`;
  console.log(line(keys));
  console.log(`|${widths.map((w) => "-".repeat(w + 2)).join("|")}|`);
  for (const r of rows) console.log(line(keys.map((k) => String(r[k]))));
}

async function main(): Promise<void> {
  assertSeedAllowed();
  const startedAt = Date.now();
  const host = connectionHost();
  console.log(`seed: database host ${host}${process.env.SEED_ALLOW === "1" ? " (SEED_ALLOW=1)" : ""}`);

  const slugs = DEMO_TENANTS.map((t) => t.slug);
  const emails = DEMO_TENANTS.flatMap((t) => t.users.map((u) => u.email.toLowerCase()));
  const deleted = await deleteDemoTenants(slugs, emails);
  console.log(`seed: removed ${deleted} existing demo tenant(s) [${slugs.join(", ")}]`);

  // One cost-12 hash shared by the non-admin demo users (the admin's hash comes from signupTenant).
  const passwordHash = await hashPassword(DEMO_PASSWORD);

  const seeded: SeededTenant[] = [];
  for (const spec of DEMO_TENANTS) {
    const t0 = Date.now();
    const result = await seedTenant(spec, passwordHash);
    seeded.push(result);
    console.log(`seed: ${spec.name} (${spec.slug}) loaded in ${Date.now() - t0} ms — orders ${result.orderNumbers[0]}…${result.orderNumbers[result.orderNumbers.length - 1]}`);
  }

  console.log("");
  console.log("Row counts per tenant (re-counted from the database):");
  const countRows: Record<string, string | number>[] = [];
  for (const t of seeded) {
    const counts = await verifyCounts(t.tenantId);
    countRows.push({ tenant: t.spec.slug, ...counts });
    const mismatches = (
      [
        ["customers", t.counts.customers],
        ["workCenters", t.counts.workCenters],
        ["machines", t.counts.machines],
        ["materials", t.counts.materials],
        ["products", t.counts.products],
        ["orders", t.counts.orders],
        ["movements", t.counts.stockMovements],
        ["downtime", t.counts.downtimeWindows],
      ] as const
    ).filter(([key, expected]) => counts[key] !== expected);
    if (mismatches.length > 0) {
      throw new Error(`seed: count mismatch for ${t.spec.slug}: ${mismatches.map(([k, v]) => `${k} expected ${v} got ${counts[k]}`).join(", ")}`);
    }
  }
  printTable(countRows);

  console.log("");
  console.log("Demo logins (password for every account: " + DEMO_PASSWORD + "):");
  printTable(
    DEMO_TENANTS.flatMap((t) =>
      t.users.map((u) => ({ tenant: t.name, slug: t.slug, email: u.email, role: u.role, name: u.name })),
    ),
  );
  console.log("");
  console.log(`seed: done in ${Date.now() - startedAt} ms. These credentials are public — rotate them before real data goes in.`);
}

main()
  .catch((err: unknown) => {
    console.error(err instanceof Error ? `${err.name}: ${err.message}` : String(err));
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
