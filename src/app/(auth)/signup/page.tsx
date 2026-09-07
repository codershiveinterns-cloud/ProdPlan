import type { Metadata } from "next";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  DEFAULT_TIMEZONE,
  timeZoneOffsetLabel,
  timeZoneOptions,
} from "@/lib/auth/timezones";
import { demoLoginAction } from "@/app/(auth)/actions";
import { AuthCardShell } from "@/app/(auth)/_components/auth-card-shell";
import { DemoLinkButton } from "@/app/(auth)/_components/demo-link-button";
import { SignupForm } from "@/app/(auth)/signup/signup-form";

export const metadata: Metadata = { title: "Create your workspace" };

export default async function SignupPage() {
  const now = new Date();
  const timezones = timeZoneOptions().map((tz) => ({
    value: tz,
    label: tz.replace(/_/g, " "),
    hint: timeZoneOffsetLabel(tz, now),
  }));
  return (
    <AuthCardShell>
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="text-xl">Create your workspace</CardTitle>
          <CardDescription>
            Set up your plant in a minute. You will be the first admin and can
            invite your team from Settings.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SignupForm
            timezones={timezones}
            defaultTimezone={DEFAULT_TIMEZONE}
          />
        </CardContent>
        <CardFooter className="justify-center text-sm">
          <span className="text-muted-foreground">
            Already have an account?
          </span>
          <Link
            href="/login"
            className="ml-1.5 font-medium underline-offset-4 hover:underline"
          >
            Sign in
          </Link>
        </CardFooter>
      </Card>
      <form
        action={demoLoginAction.bind(null, "ADMIN")}
        className="text-center text-sm"
      >
        <span className="text-muted-foreground">Just looking?</span>
        <DemoLinkButton>Open the demo plant</DemoLinkButton>
      </form>
    </AuthCardShell>
  );
}
