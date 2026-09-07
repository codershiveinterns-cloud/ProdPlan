import type { Metadata } from "next";
import Link from "next/link";
import { Info } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { safeNext } from "@/lib/auth/guards";
import { LoginForm } from "@/app/(auth)/login/login-form";

export const metadata: Metadata = { title: "Sign in" };

const REASON_MESSAGES: Record<string, string> = {
  revoked: "Your session was signed out because your account changed. Please sign in again.",
  "signed-out": "You have been signed out.",
  expired: "Your session expired. Please sign in again.",
};

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

type SearchParams = Record<string, string | string[] | undefined>;

export default async function LoginPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const next = safeNext(first(sp.next));
  const reason = first(sp.reason);
  const banner = reason ? REASON_MESSAGES[reason] : undefined;

  return (
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
      <CardFooter className="justify-center text-sm">
        <span className="text-muted-foreground">New plant?</span>
        <Link href="/signup" className="ml-1.5 font-medium underline-offset-4 hover:underline">
          Create a workspace
        </Link>
      </CardFooter>
    </Card>
  );
}
