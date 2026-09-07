"use server";

import { revalidatePath } from "next/cache";
import { ok, withAction } from "@/lib/action";
import { auditContext } from "@/lib/audit";
import { requirePermission } from "@/lib/auth/guards";
import { seedDemoData } from "@/lib/demo/seed-tenant";

/**
 * "Load demo data" (docs/M1_SPEC.md §6.6, §7). ADMIN only (`tenant:manage`); `seedDemoData()` refuses unless the
 * plant has 0 products and 0 orders and writes its own IMPORT audit row inside the same transaction.
 */
export const loadDemoDataAction = withAction(async () => {
  const { session, db } = await requirePermission("tenant:manage");
  const ctx = await auditContext(session);
  const result = await seedDemoData(db, session.tenant, session.user, { ip: ctx.ip, userAgent: ctx.userAgent });
  // Demo data touches every list, so refresh the whole app tree.
  revalidatePath("/", "layout");
  const c = result.counts;
  return ok(
    { counts: c },
    `Demo data loaded: ${c.orders} orders, ${c.products} products, ${c.materials} materials, ${c.machines} machines`,
  );
});
