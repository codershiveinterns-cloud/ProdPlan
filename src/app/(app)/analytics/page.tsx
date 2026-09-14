import type { Metadata } from "next";
import { AlertTriangle, CalendarCheck2, Gauge, TrendingUp } from "lucide-react";

import { DashboardSection } from "@/app/(app)/dashboard/_components/DashboardSection";
import { AT_RISK_DELIVERY_RISKS } from "@/lib/dashboard/queries";
import { StatCard } from "@/components/data/StatCard";
import { ExportButton } from "@/components/export/ExportButton";
import { PageHeader } from "@/components/layout/PageHeader";
import { loadAnalytics } from "@/lib/analytics/dashboard";
import { predictShortages, type ShortagePrediction } from "@/lib/analytics/shortage";
import { requirePagePermission } from "@/lib/auth/guards";
import { todayInTz } from "@/lib/dates";
import { formatDate, formatInt, formatPercent } from "@/lib/format";
import { can } from "@/lib/rbac";

import { DeliveryTrendChart } from "./_components/DeliveryTrendChart";
import { MachineUtilisationTable } from "./_components/MachineUtilisationTable";
import { MaterialsAtRiskTable } from "./_components/MaterialsAtRiskTable";
import { RangeSelector } from "./_components/RangeSelector";
import { ThroughputByPriority } from "./_components/ThroughputByPriority";
import { parseAnalyticsRange, type AnalyticsSearchParams } from "./params";

export const metadata: Metadata = { title: "Analytics" };

export default async function AnalyticsPage({ searchParams }: { searchParams: Promise<AnalyticsSearchParams> }) {
  const { session, db } = await requirePagePermission("analytics:read");
  const tz = session.tenant.timezone;
  const today = todayInTz(tz);
  const range = parseAnalyticsRange(await searchParams, today);

  const [analytics, shortages] = await Promise.all([
    loadAnalytics(db, { range, tz, today }),
    predictShortages(db, { asOf: new Date() }),
  ]);

  const materialsAtRisk = shortages.filter((m: ShortagePrediction) => m.severity === "WATCH" || m.severity === "SHORT");
  const canExport = can(session.user.role, "exports:create");

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Analytics"
        description={`${session.tenant.name} · ${formatDate(range.from)} – ${formatDate(range.to)}`}
        breadcrumbs={[{ label: "Analytics" }]}
        actions={
          <>
            {canExport ? (
              // The KPI/utilisation/trend aggregates on this page have no matching ExportKind (only ORDERS/SCHEDULE/
              // PRODUCTION_STATUS/AUDIT_LOG exist) — exporting the live "Open orders at risk" list is the one thing
              // on this page that maps onto a real export, so the button is labelled for exactly what it does rather
              // than implying it exports the whole dashboard view.
              <ExportButton kind="ORDERS" label="Export at-risk orders" filters={{ status: "all", risk: AT_RISK_DELIVERY_RISKS.join(",") }} />
            ) : null}
            <RangeSelector range={range} todayIso={today} />
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="On-time delivery"
          value={analytics.kpis.onTimeDeliveryRate === null ? "—" : formatPercent(analytics.kpis.onTimeDeliveryRate)}
          icon={CalendarCheck2}
          hint={analytics.kpis.throughput > 0 ? `Of ${formatInt(analytics.kpis.throughput)} completed orders` : "No orders completed in range"}
        />
        <StatCard label="Order throughput" value={formatInt(analytics.kpis.throughput)} icon={TrendingUp} hint="Orders completed in range" />
        <StatCard
          href={`/orders?risk=${AT_RISK_DELIVERY_RISKS.join(",")}`}
          label="Open orders at risk"
          value={formatInt(analytics.kpis.openOrdersAtRisk)}
          icon={AlertTriangle}
          tone={analytics.kpis.openOrdersAtRisk > 0 ? "warn" : "default"}
          hint="Live, not limited to the date range"
        />
        <StatCard
          label="Avg. machine utilisation"
          value={formatPercent(analytics.kpis.avgMachineUtilisation)}
          icon={Gauge}
          hint="Next 7 days, all active machines"
        />
      </div>

      <DashboardSection title="Machine utilisation" description="Next 7 days, highest first. Links to the planning board.">
        <MachineUtilisationTable rows={analytics.machineUtilisation} />
      </DashboardSection>

      <DashboardSection title="On-time delivery trend" description="Weekly on-time rate for orders completed within the selected range.">
        <DeliveryTrendChart weeks={analytics.trend} />
      </DashboardSection>

      <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <DashboardSection
          title="Materials at risk"
          description="Predicted stockouts against open, non-cancelled orders — a live snapshot, not limited to the date range."
          className="min-w-0"
        >
          <MaterialsAtRiskTable rows={materialsAtRisk} />
        </DashboardSection>

        <DashboardSection title="Throughput by priority" description="Completed orders in range.">
          <ThroughputByPriority counts={analytics.throughputByPriority} />
        </DashboardSection>
      </div>
    </div>
  );
}
