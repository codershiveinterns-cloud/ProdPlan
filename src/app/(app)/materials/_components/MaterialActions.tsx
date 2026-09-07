"use client";

import Link from "next/link";
import { Pencil, Power, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/data/ConfirmDialog";

import { deleteMaterialAction, setMaterialActiveAction } from "../actions";

export type MaterialActionsProps = {
  material: { id: string; code: string; name: string; isActive: boolean };
  /** "used by 3 BOM lines and 12 stock movements" — shown in the dialog when a delete is not possible. */
  referencesLabel: string;
  deletable: boolean;
};

/** Detail-page header actions for `materials:write`: Edit, Deactivate / Reactivate, Delete (when unreferenced). */
export function MaterialActions({ material, referencesLabel, deletable }: MaterialActionsProps) {
  return (
    <>
      <Button variant="outline" asChild>
        <Link href={`/materials/${material.id}/edit`}>
          <Pencil data-icon="inline-start" />
          Edit
        </Link>
      </Button>
      <ConfirmDialog
        trigger={
          <Button variant="outline">
            <Power data-icon="inline-start" />
            {material.isActive ? "Deactivate" : "Reactivate"}
          </Button>
        }
        title={material.isActive ? `Deactivate ${material.code}?` : `Reactivate ${material.code}?`}
        description={
          material.isActive
            ? "The material is hidden from BOM and movement pickers and no new movements can be recorded. Its history and stock on hand are kept."
            : "The material becomes available in pickers and stock movements again."
        }
        confirmLabel={material.isActive ? "Deactivate" : "Reactivate"}
        action={setMaterialActiveAction.bind(null, material.id, !material.isActive)}
      />
      {deletable ? (
        <ConfirmDialog
          trigger={
            <Button variant="destructive">
              <Trash2 data-icon="inline-start" />
              Delete
            </Button>
          }
          title={`Delete ${material.code}?`}
          description={`${material.name} is ${referencesLabel}. This cannot be undone.`}
          confirmLabel="Delete"
          destructive
          action={deleteMaterialAction.bind(null, material.id)}
        />
      ) : null}
    </>
  );
}
