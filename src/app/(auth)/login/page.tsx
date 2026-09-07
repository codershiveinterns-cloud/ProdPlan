import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Info } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { safeNext } from "@/lib/auth/guards";
import { BrandPanel, BrandStrip } from "@/app/(auth)/_components/brand-panel";
import { DemoProfiles } from "@/app/(auth)/_components/demo-profiles";
import { LoginForm } from "@/app/(auth)/login/login-form";

export const metadata: Metadata = { title: "Sign in" };

const REASON_MESSAGES: Record<string, string> = {
  revoked: "Your session was signed out because your account changed. Please sign in again.",
  "signed-out": "You have been signed out.",
  expired: "Your session expired. Please sign in again.",
  "demo-reset": "The demo plant was refreshed. Pick a profile to continue.",
  "demo-limited": "Too many demo sign-ins from this network. Please try again in a little while.",
  "demo-unavailable": "The demo plant is not available right now. Please try again in a minute.",
};

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

type SearchParams = Record<string, string | string[] | undefined>;

/**
 * /login — two columns from `lg` (brand panel · sign-in card + demo profiles), single column below with the compact
 * brand strip above the form (docs/M1_SPEC.md §6.9 "Login page layout").
 */
export default async function LoginPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const next = safeNext(first(sp.next));
  const reason = first(sp.reason);
  const banner = reason ? REASON_MESSAGES[reason] : undefined;

  return (
    <div className="grid flex-1 grid-cols-1 lg:grid-cols-[minmax(0,11fr)_minmax(0,13fr)] xl:grid-cols-2">
      <BrandStrip className="lg:hidden" />
      <BrandPanel className="hidden lg:flex" />

      <section className="flex flex-col items-center justify-center px-4 py-8 sm:px-8 lg:py-12">
        <div className="flex w-full max-w-md flex-col gap-6">
          <Card className="w-full">
            <CardHeader>
              <CardTitle className="text-xl">Sign in</CardTitle>
              <CardDescription>Welcome back. Enter your details to continue.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-5">
              {banner ? (
                <Alert role="status">
                  <Info aria-hidden="true" />
                  <AlertDescription>{banner}</AlertDescription>
                </Alert>
              ) : null}
              <LoginForm next={next} />
              <p className="text-center text-sm text-muted-foreground">
                Forgot your password? Ask your plant admin to reset it.
              </p>
            </CardContent>
          </Card>

          <div className="flex items-center gap-3 text-xs text-muted-foreground" aria-hidden="true">
            <span className="h-px flex-1 bg-border" />
            or
            <span className="h-px flex-1 bg-border" />
          </div>

          <DemoProfiles />

          <p className="text-center text-sm">
            <span className="text-muted-foreground">New plant?</span>
            <Link
              href="/signup"
              className="ml-1.5 inline-flex items-center gap-1 font-medium text-primary underline-offset-4 hover:underline"
            >
              Create a workspace
              <ArrowRight className="size-3.5" aria-hidden="true" />
            </Link>
          </p>
        </div>
      </section>
    </div>
  );
}
