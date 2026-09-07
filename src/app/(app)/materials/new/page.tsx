import type { Metadata } from "next";

import { PageHeader } from "@/components/layout/PageHeader";
import { requirePagePermission } from "@/lib/materials/page-guard";

import { MaterialForm } from "../_components/MaterialForm";

export const metadata: Metadata = { title: "New material" };

export default async function NewMaterialPage() {
  await requirePagePermission("materials:write");
  return (
    <>
      <PageHeader
        title="New material"
        description="Master data for a raw material or bought-in part. Stock on hand starts at 0 — record a receipt afterwards."
        breadcrumbs={[{ label: "Materials", href: "/materials" }, { label: "New material" }]}
      />
      <div className="max-w-3xl rounded-xl bg-card p-4 ring-1 ring-foreground/10 md:p-6">
        <MaterialForm cancelHref="/materials" />
      </div>
    </>
  );
}
