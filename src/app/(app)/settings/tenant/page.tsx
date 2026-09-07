import type { Metadata } from "next";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { timeZoneOffsetLabel, timeZoneOptions } from "@/lib/auth/timezones";
import { listCalendarOptions } from "@/lib/tenant/settings";

import { requirePagePermission } from "../_lib/guard";
import { TenantSettingsForm } from "./_components/TenantSettingsForm";

export const metadata: Metadata = { title: "Tenant settings" };

/** Tenant settings (docs/M1_SPEC.md §6.8): name, timezone (searchable), default shift calendar. ADMIN only. */
export default async function TenantSettingsPage() {
  const { session, db } = await requirePagePermission("tenant:manage");
  const tenant = session.tenant;
  const calendars = await listCalendarOptions(db, tenant.defaultCalendarId);
  const now = new Date();
  const timezones = timeZoneOptions().map((tz) => ({
    value: tz,
    label: tz.replace(/_/g, " "),
    hint: timeZoneOffsetLabel(tz, now),
  }));

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>Plant</CardTitle>
          <CardDescription>
            The plant timezone drives “today”, due-date hints and every shift calendar calculation.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <TenantSettingsForm
            tenant={{ name: tenant.name, timezone: tenant.timezone, defaultCalendarId: tenant.defaultCalendarId }}
            calendars={calendars}
            timezones={timezones}
          />
        </CardContent>
      </Card>
      <Card size="sm" className="h-fit">
        <CardHeader>
          <CardTitle>Shift calendars</CardTitle>
          <CardDescription>
            New machines start on the default calendar. Changing the default never moves existing machines.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <ul className="flex flex-col gap-1 text-sm">
            {calendars.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-2">
                <span className={c.isActive ? undefined : "text-muted-foreground"}>
                  {c.name}
                  {c.isActive ? "" : " (inactive)"}
                </span>
                {c.isDefault ? <span className="text-xs font-medium text-primary">Default</span> : null}
              </li>
            ))}
            {calendars.length === 0 ? <li className="text-muted-foreground">No calendars yet.</li> : null}
          </ul>
          <Button variant="outline" asChild className="w-fit">
            <Link href="/calendars">Manage calendars</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
