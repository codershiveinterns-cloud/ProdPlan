"use client";

import { Sparkles } from "lucide-react";

import { ConfirmDialog } from "@/components/data/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { loadDemoDataAction } from "../actions";

/** ADMIN-only "Load demo data" with a confirmation step (spec §6.6). Only rendered for an empty plant. */
export function LoadDemoDataButton() {
  return (
    <ConfirmDialog
      trigger={
        <Button variant="outline">
          <Sparkles data-icon="inline-start" aria-hidden="true" />
          Load demo data
        </Button>
      }
      title="Load demo data into this plant?"
      description="Adds a sample plant — customers, work centers, machines, materials, products with BOMs and routings, 24 orders, stock movements and downtime — so you can explore ProdPlan before entering real data. It only works while the plant has no products or orders."
      confirmLabel="Load demo data"
      action={(formData) => loadDemoDataAction(null, formData)}
      successMessage="Demo data loaded"
    />
  );
}
