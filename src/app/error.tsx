"use client";

import Link from "next/link";
import { TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { StatusPage } from "@/components/layout/StatusPage";

/**
 * Root error boundary (Client Component). Next 16 passes `retry()` (re-fetch + re-render the segment).
 * The error message itself is not shown: server errors are already sanitised by Next, and the digest is
 * enough for support to find the log line.
 */
export default function RootError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <StatusPage
      code="Error"
      icon={TriangleAlert}
      title="Something went wrong"
      description="The page could not be rendered. Try again, or go back to the dashboard. If it keeps happening, tell your admin."
      detail={error.digest ? `Reference: ${error.digest}` : undefined}
      actions={
        <>
          <Button onClick={() => retry()}>Try again</Button>
          <Button variant="outline" asChild>
            <Link href="/dashboard">Go to dashboard</Link>
          </Button>
        </>
      }
    />
  );
}
