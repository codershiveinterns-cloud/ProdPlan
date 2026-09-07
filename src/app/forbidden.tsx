import Link from "next/link";
import { ShieldAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { StatusPage } from "@/components/layout/StatusPage";

/**
 * Rendered by Next when a page calls `forbidden()` (requires `experimental.authInterrupts: true` in next.config.ts).
 * Returns HTTP 403.
 */
export default function Forbidden() {
  return (
    <StatusPage
      code="403"
      icon={ShieldAlert}
      title="You don't have access to this page"
      description="Your role does not include this permission. Ask your plant admin if you think you should have it."
      actions={
        <Button asChild>
          <Link href="/dashboard">Go to dashboard</Link>
        </Button>
      }
    />
  );
}
