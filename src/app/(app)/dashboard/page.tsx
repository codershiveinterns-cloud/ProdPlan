import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";

import { AuditList, type AuditListEntry } from "@/components/data/AuditList";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { describeAudit } from "@/lib/audit";
import { requirePermission } from "@/lib/auth/guards";
import { loadDashboard, setupSteps, type SetupStep } from "@/lib/dashboard/queries";
import { todayInTz } from "@/lib/dates";
import { formatDate, formatDateTime, formatInt, formatQty, formatRelative, formatTime } from "@/lib/format";
import { can, type Permission } from "@/lib/rbac";
import type { Role } from "@/generated/prisma/enums";

import { DashboardSection } from "./_components/DashboardSection";
import { KpiTiles } from "./_components/KpiTiles";
import { LoadDemoDataButton } from "./_components/LoadDemoDataButton";
import { MachinesTable, type MachineRow } from "./_components/MachinesTable";
import { OrdersDueTable, type OrdersDueRow } from "./_components/OrdersDueTable";
import { SetupChecklist, type SetupChecklistItem } from "./_components/SetupChecklist";

export const metadata: Metadata = { title: "Dashboard" };

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;

/** "Monday, 07 Sep 2026" for the header — from the tenant-timezone ISO date, so it never disagrees with the KPIs. */
function headerDate(today: string): string {
  const [y, m, d] = today.split("-").map(Number);
  const weekday = WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${weekday}, ${formatDate(today)}`;
}

/** Step buttons: creators go to the "new" form, read-only roles to the list. */
function checklistItems(steps: SetupStep[], role: Role, defaultCalendarId: string | null): SetupChecklistItem[] {
  const writable = (permission: Permission) => can(role, permission);
  return steps.map((step) => {
    switch (step.key) {
      case "workCenters":
        return { ...step, action: { href: "/work-centers", label: step.done ? "Manage work centers" : "Add work center" } };
      case "calendar":
        return {
          ...step,
          action: { href: defaultCalendarId ? `/calendars/${defaultCalendarId}` : "/calendars", label: "Review calendar" },
        };
      case "machines":
        return { ...step, action: { href: writable("machines:write") ? "/machines/new" : "/machines", label: step.done ? "View machines" : "Add machine" } };
      case "materials":
        return { ...step, action: { href: writable("materials:write") ? "/materials/new" : "/materials", label: step.done ? "View materials" : "Add material" } };
      case "products":
        return { ...step, action: { href: writable("products:write") ? "/products/new" : "/products", label: step.done ? "View products" : "Add product" } };
      case "orders":
        return writable("orders:write")
          ? { ...step, action: { href: "/orders/new", label: "Create order" }, secondary: { href: "/orders/import", label: "Import CSV" } }
          : { ...step, action: { href: "/orders", label: "View orders" } };
    }
  });
}

export default async function DashboardPage() {
  const { session, db } = await requirePermission("dashboard:read");
  const role = session.user.role;
  const tz = session.tenant.timezone;
  const now = new Date();
  const today = todayInTz(tz, now);

  const data = await loadDashboard(db, { today, now, includeSensitiveAudit: can(role, "audit:read-all") });

  const canCreateOrders = can(role, "orders:write");
  const canCreateMachines = can(role, "machines:write");
  const firstRun = data.totals.orders === 0;
  const canLoadDemo = firstRun && role === "ADMIN" && can(role, "tenant:manage") && data.totals.products === 0;

  const orderRows: OrdersDueRow[] = data.ordersByDue.map((o) => ({
    ...o,
    quantityLabel: formatQty(o.quantity, o.unit),
    dueDateLabel: formatDate(o.dueDate),
  }));

  const machineRows: MachineRow[] = data.machines.map((m) => ({
    ...m,
    activeDowntime: m.activeDowntime
      ? { type: m.activeDowntime.type, until: formatTime(m.activeDowntime.endsAt, tz), reason: m.activeDowntime.reason }
      : null,
  }));

  const activity: AuditListEntry[] = data.activity.map((row) => {
    // describeAudit() renders "{actor} {verb} {entity} {label}"; AuditList shows the actor in bold, so split it off.
    const actor = actorLabel(row);
    const { text, href } = describeAudit(row);
    return {
      id: row.id,
      summary: text.startsWith(`${actor} `) ? text.slice(actor.length + 1) : text,
      actorName: actor,
      href,
      createdAtIso: row.createdAt,
      relative: formatRelative(row.createdAt, now, tz),
      absolute: formatDateTime(row.createdAt, tz),
    };
  });

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Dashboard"
        description={
          <>
            {session.tenant.name} · {headerDate(today)} · {tz}
          </>
        }
        actions={
          canCreateOrders ? (
            <>
              <Button variant="outline" asChild>
                <Link href="/orders/import">Import CSV</Link>
              </Button>
              <Button asChild>
                <Link href="/orders/new">
                  <Plus data-icon="inline-start" aria-hidden="true" />
                  New order
                </Link>
              </Button>
            </>
          ) : undefined
        }
      />

      {firstRun ? (
        <SetupChecklist
          items={checklistItems(setupSteps(data.totals), role, session.tenant.defaultCalendarId)}
          extra={canLoadDemo ? <LoadDemoDataButton /> : undefined}
        />
      ) : null}

      <KpiTiles kpis={data.kpis} hrefs={data.hrefs} />

      <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex min-w-0 flex-col gap-8">
          <DashboardSection
            title="Orders by due date"
            description="Open orders, earliest due first. Overdue rows are tinted."
            viewAll={{ href: data.hrefs.open, label: data.kpis.orders.open > 0 ? `View all ${formatInt(data.kpis.orders.open)}` : "View all" }}
            flush
          >
            <OrdersDueTable rows={orderRows} today={today} canCreate={canCreateOrders} />
          </DashboardSection>

          <DashboardSection
            title="Machines"
            description="By work center, with any downtime window covering right now."
            viewAll={{ href: data.hrefs.machines, label: data.totals.machines > 0 ? `View all ${formatInt(data.totals.machines)}` : "View all" }}
            flush
          >
            <MachinesTable rows={machineRows} canCreate={canCreateMachines} />
          </DashboardSection>
        </div>

        <DashboardSection title="Recent activity" description="Latest changes to orders and master data." className="min-w-0">
          <AuditList entries={activity} emptyTitle="No activity yet" />
        </DashboardSection>
      </div>
    </div>
  );
}

/** Same fallback chain as describeAudit(): name → email → "System". */
function actorLabel(row: { actorName: string | null; actorEmail: string | null }): string {
  return row.actorName?.trim() || row.actorEmail?.trim() || "System";
}
