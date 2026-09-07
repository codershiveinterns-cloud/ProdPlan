/**
 * One-off dev helper for the products module (docs/M1_SPEC.md §6.5): seeds a throwaway tenant with the master
 * data the products pages need, so the UI can be exercised against the local dev database.
 *
 *   npx tsx scripts/dev/products-smoke-seed.ts            # create tenant + data, print the admin email
 *   npx tsx scripts/dev/products-smoke-seed.ts --cleanup  # delete every tenant whose slug starts with products-smoke
 *
 * Refuses to run against a non-local database host. Uses the raw client (scripts are not module code).
 */
import "dotenv/config";

function fail(message: string): never {
  process.stderr.write(`products-smoke-seed: ${message}\n`);
  process.exit(1);
}

const url = process.env.DATABASE_URL ?? process.env.NETLIFY_DB_URL;
const host = url ? new URL(url).hostname : null;
if (!host || !["127.0.0.1", "localhost", "::1"].includes(host)) fail(`refusing to run against ${host ?? "no database"}`);

async function main(): Promise<void> {
  const { prisma, tenantDb } = await import("../../src/lib/db");
  const { signupTenant } = await import("../../src/lib/auth/signup");
  const { createProduct, addBomItem, addOperation } = await import("../../src/lib/products/mutations");

  if (process.argv.includes("--cleanup")) {
    const { count } = await prisma.tenant.deleteMany({ where: { slug: { startsWith: "products-smoke" } } });
    process.stdout.write(`deleted ${count} smoke tenant(s)\n`);
    await prisma.$disconnect();
    return;
  }

  // Same path as the real signup form: tenant + ADMIN + default "General shift" calendar in one transaction.
  const stamp = Date.now().toString(36);
  const email = `admin@products-smoke-${stamp}.test`;
  const signup = await signupTenant({
    company: `products-smoke-${stamp}`,
    timezone: "Asia/Kolkata",
    name: "Smoke Admin",
    email,
    password: "Password123!",
  });
  const tenantId = signup.tenant.id;
  const calendarId = signup.tenant.defaultCalendarId;
  if (!calendarId) fail("signup did not create a default calendar");

  const seeded = await prisma.$transaction(async (tx) => {
    const tenant = await tx.tenant.findUniqueOrThrow({ where: { id: tenantId } });
    const admin = await tx.user.findUniqueOrThrow({ where: { id: signup.user.id } });
    const [al, bolt, paint] = await Promise.all([
      tx.material.create({ data: { tenantId, code: "RM-AL6061-BAR", name: "Aluminium 6061 bar", unit: "kg", stockOnHand: 200, reorderThreshold: 50 } }),
      tx.material.create({ data: { tenantId, code: "HW-M8-BOLT", name: "M8 × 30 bolt", unit: "pcs", stockOnHand: 1000, reorderThreshold: 200 } }),
      tx.material.create({ data: { tenantId, code: "PT-RAL9005", name: "Paint RAL 9005 black", unit: "l", stockOnHand: 3, reorderThreshold: 5 } }),
    ]);
    await tx.material.create({ data: { tenantId, code: "OLD-STEEL", name: "Retired steel", unit: "kg", isActive: false } });

    const [cnc, asm, pnt] = await Promise.all([
      tx.workCenter.create({ data: { tenantId, code: "CNC", name: "CNC machining" } }),
      tx.workCenter.create({ data: { tenantId, code: "ASM", name: "Assembly" } }),
      tx.workCenter.create({ data: { tenantId, code: "PNT", name: "Paint shop" } }),
    ]);
    await Promise.all([
      tx.machine.create({ data: { tenantId, workCenterId: cnc.id, calendarId, code: "CNC-1", name: "Haas VF-2" } }),
      tx.machine.create({ data: { tenantId, workCenterId: cnc.id, calendarId, code: "CNC-2", name: "DMG Mori", status: "MAINTENANCE" } }),
      tx.machine.create({ data: { tenantId, workCenterId: cnc.id, calendarId, code: "CNC-OLD", name: "Retired mill", status: "INACTIVE" } }),
      tx.machine.create({ data: { tenantId, workCenterId: asm.id, calendarId, code: "ASM-1", name: "Bench 1" } }),
    ]);
    return { tenant, admin, materials: { al, bolt, paint }, workCenters: { cnc, asm, pnt } };
  });

  const db = tenantDb(seeded.tenant.id);
  const session = {
    user: seeded.admin,
    tenant: {
      id: seeded.tenant.id,
      name: seeded.tenant.name,
      slug: seeded.tenant.slug,
      timezone: seeded.tenant.timezone,
      defaultCalendarId: seeded.tenant.defaultCalendarId,
    },
  };
  const base = { description: undefined, isActive: undefined };
  const hb = await createProduct(db, session, { ...base, sku: "HB-200", name: "Hydraulic Bracket 200", unit: "pcs", description: "Machined aluminium bracket, black powder coat." });
  await addBomItem(db, session, { productId: hb.id, materialId: seeded.materials.al.id, quantityPerUnit: 2.5, scrapPercent: 10, note: "cut to 200 mm" });
  await addBomItem(db, session, { productId: hb.id, materialId: seeded.materials.bolt.id, quantityPerUnit: 4, scrapPercent: 0, note: undefined });
  await addBomItem(db, session, { productId: hb.id, materialId: seeded.materials.paint.id, quantityPerUnit: 0.05, scrapPercent: 0, note: undefined });
  await addOperation(db, session, { productId: hb.id, workCenterId: seeded.workCenters.cnc.id, machineId: undefined, setupMinutes: 30, runMinutesPerUnit: 2.5 });
  await addOperation(db, session, { productId: hb.id, workCenterId: seeded.workCenters.asm.id, machineId: undefined, setupMinutes: 10, runMinutesPerUnit: 4 });
  await addOperation(db, session, { productId: hb.id, workCenterId: seeded.workCenters.pnt.id, machineId: undefined, setupMinutes: 0, runMinutesPerUnit: 1.25 });

  const gx = await createProduct(db, session, { ...base, sku: "GX-40", name: "Gearbox Housing 40", unit: "pcs" });
  const customer = await prisma.customer.create({ data: { tenantId: seeded.tenant.id, name: "Bharat OEM" } });
  await prisma.order.create({
    data: { tenantId: seeded.tenant.id, orderNumber: "SO-000001", customerId: customer.id, productId: gx.id, quantity: 250, dueDate: new Date(Date.UTC(2026, 9, 15)), createdById: seeded.admin.id },
  });
  await createProduct(db, session, { ...base, sku: "SP-01", name: "Spare plate (retired)", unit: "pcs", isActive: false });
  await createProduct(db, session, { ...base, sku: "KT-10", name: "Kit 10 (no BOM yet)", unit: "set" });

  process.stdout.write(`${email}\n`);
  await prisma.$disconnect();
}

main().catch((err) => fail(err instanceof Error ? err.stack ?? err.message : String(err)));
