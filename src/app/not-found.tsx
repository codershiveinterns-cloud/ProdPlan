import Link from "next/link";
import { FileSearch } from "lucide-react";

import { Button } from "@/components/ui/button";
import { StatusPage } from "@/components/layout/StatusPage";

export default function NotFound() {
  return (
    <StatusPage
      code="404"
      icon={FileSearch}
      title="We couldn't find that"
      description="The page or record you asked for doesn't exist, was deleted, or belongs to another plant."
      actions={
        <Button asChild>
          <Link href="/dashboard">Go to dashboard</Link>
        </Button>
      }
    />
  );
}
