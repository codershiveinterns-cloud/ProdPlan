import type { Metadata } from "next";
import { ShieldAlert } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateTime } from "@/lib/format";
import { ROLE_LABELS } from "@/lib/rbac";

import { firstParam, requirePagePermission } from "../_lib/guard";
import { ChangePasswordForm } from "./_components/ChangePasswordForm";
import { ProfileNameForm } from "./_components/ProfileNameForm";
import { SignOutEverywhere } from "./_components/SignOutEverywhere";

export const metadata: Metadata = { title: "Profile" };

type SearchParams = Record<string, string | string[] | undefined>;

/**
 * Own profile (docs/M1_SPEC.md §6.8, `profile:self`): name, change password, "Sign out everywhere".
 * Reachable while `mustChangePassword` is pending — `requireSession()` sends such users here with `?force=1`.
 */
export default async function ProfilePage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const { session } = await requirePagePermission("profile:self", { allowMustChangePassword: true });
  const sp = await searchParams;
  const forced = session.user.mustChangePassword || firstParam(sp.force) === "1";
  const tz = session.tenant.timezone;
  const user = session.user;

  return (
    <div className="flex flex-col gap-6">
      {forced ? (
        <Alert variant="destructive">
          <ShieldAlert aria-hidden="true" />
          <AlertTitle>You must set a new password before continuing</AlertTitle>
          <AlertDescription>
            Your password was set by an admin. Choose a new one below to keep using ProdPlan.
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className={forced ? "order-2" : undefined}>
          <CardHeader>
            <CardTitle>Your details</CardTitle>
            <CardDescription>
              <span className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary">{ROLE_LABELS[user.role]}</Badge>
                <span>{session.tenant.name}</span>
                {user.lastLoginAt ? <span>· Last sign-in {formatDateTime(user.lastLoginAt, tz)}</span> : null}
              </span>
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ProfileNameForm name={user.name} email={user.email} />
          </CardContent>
        </Card>

        <Card className={forced ? "order-1 ring-destructive/40" : undefined}>
          <CardHeader>
            <CardTitle>Change password</CardTitle>
            <CardDescription>Changing your password signs you out on every other device.</CardDescription>
          </CardHeader>
          <CardContent>
            <ChangePasswordForm forced={forced} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Sessions</CardTitle>
          <CardDescription>
            Lost a phone or used a shared floor terminal? Sign out everywhere except this device.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SignOutEverywhere />
        </CardContent>
      </Card>
    </div>
  );
}
