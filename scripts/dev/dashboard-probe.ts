/** Dev-only: render the dashboard data for a seeded tenant (default admin@acme.test) to stdout. */
import "dotenv/config";

async function main() {
  const email = process.argv[2] ?? "admin@acme.test";
  const [{ prisma, tenantDb }, { loadDashboard, setupSteps }, { todayInTz }, { describeAudit }, { formatRelative, formatTime }] = await Promise.all([
    import("../../src/lib/db"),
    import("../../src/lib/dashboard/queries"),
    import("../../src/lib/dates"),
    import("../../src/lib/audit"),
    import("../../src/lib/format"),
  ]);
  const user = await prisma.user.findUniqueOrThrow({ where: { email }, include: { tenant: true } });
  const db = tenantDb(user.tenantId);
  const now = new Date();
  const today = todayInTz(user.tenant.timezone, now);
  const t0 = Date.now();
  const data = await loadDashboard(db, { today, now, includeSensitiveAudit: user.role === "ADMIN" });
  console.log(`loadDashboard for ${email} (${user.role}) in ${Date.now() - t0} ms; today=${today}`);
  console.log("kpis", JSON.stringify(data.kpis));
  console.log("totals", JSON.stringify(data.totals), "steps", setupSteps(data.totals).map((s) => `${s.key}:${s.done}`).join(" "));
  console.log("hrefs", JSON.stringify(data.hrefs));
  console.log("orders by due:");
  for (const o of data.ordersByDue) console.log(`  ${o.orderNumber} ${o.dueDate} ${o.status.padEnd(11)} ${o.priority.padEnd(6)} ${o.productSku} x${o.quantity} ${o.unit} — ${o.customerName}`);
  console.log("machines:");
  for (const m of data.machines) console.log(`  ${m.workCenterCode}/${m.code} ${m.status} ${m.activeDowntime ? `DOWN ${m.activeDowntime.type} until ${formatTime(m.activeDowntime.endsAt, user.tenant.timezone)}` : ""}`);
  console.log("activity:");
  for (const a of data.activity) console.log(`  [${formatRelative(a.createdAt, now, user.tenant.timezone)}] ${describeAudit(a).text} -> ${describeAudit(a).href}`);
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
