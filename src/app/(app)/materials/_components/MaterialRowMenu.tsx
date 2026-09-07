"use client";

import Link from "next/link";
import { Eye, MoreHorizontal, PackagePlus, Pencil, Power, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ConfirmDialog } from "@/components/data/ConfirmDialog";

import { deleteMaterialAction, setMaterialActiveAction } from "../actions";

export type MaterialRowMenuProps = {
  material: { id: string; code: string; name: string; isActive: boolean };
  canWrite: boolean;
  canMove: boolean;
  /** No BOM line or stock movement references the material (server-computed), so a hard delete is offered. */
  deletable: boolean;
};

/** Row kebab for the materials list: View, Edit, Record movement, Deactivate / Reactivate, Delete. */
export function MaterialRowMenu({ material, canWrite, canMove, deletable }: MaterialRowMenuProps) {
  const detailHref = `/materials/${material.id}`;
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-xs" aria-label={`Actions for ${material.code}`}>
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem asChild>
          <Link href={detailHref}>
            <Eye />
            View
          </Link>
        </DropdownMenuItem>
        {canWrite ? (
          <DropdownMenuItem asChild>
            <Link href={`${detailHref}/edit`}>
              <Pencil />
              Edit
            </Link>
          </DropdownMenuItem>
        ) : null}
        {canMove && material.isActive ? (
          <DropdownMenuItem asChild>
            <Link href={`${detailHref}?move=1`}>
              <PackagePlus />
              Record movement
            </Link>
          </DropdownMenuItem>
        ) : null}
        {canWrite ? (
          <>
            <DropdownMenuSeparator />
            <ConfirmDialog
              trigger={
                <DropdownMenuItem onSelect={(event) => event.preventDefault()}>
                  <Power />
                  {material.isActive ? "Deactivate" : "Reactivate"}
                </DropdownMenuItem>
              }
              title={material.isActive ? `Deactivate ${material.code}?` : `Reactivate ${material.code}?`}
              description={
                material.isActive
                  ? "The material is hidden from BOM and movement pickers. Its history and stock on hand are kept."
                  : "The material becomes available in pickers and stock movements again."
              }
              confirmLabel={material.isActive ? "Deactivate" : "Reactivate"}
              action={setMaterialActiveAction.bind(null, material.id, !material.isActive)}
            />
            {deletable ? (
              <ConfirmDialog
                trigger={
                  <DropdownMenuItem variant="destructive" onSelect={(event) => event.preventDefault()}>
                    <Trash2 />
                    Delete
                  </DropdownMenuItem>
                }
                title={`Delete ${material.code}?`}
                description={`${material.name} is not used in any BOM and has no stock movements. This cannot be undone.`}
                confirmLabel="Delete"
                destructive
                action={deleteMaterialAction.bind(null, material.id)}
              />
            ) : null}
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
