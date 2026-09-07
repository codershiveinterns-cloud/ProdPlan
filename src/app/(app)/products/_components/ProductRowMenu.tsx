"use client";

import { useTransition } from "react";
import Link from "next/link";
import { Archive, ArchiveRestore, Eye, MoreHorizontal, Pencil } from "lucide-react";
import { toast } from "sonner";

import { actionErrorMessage } from "@/components/forms/action-state";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import { setProductActiveAction } from "../actions";

export type ProductRowMenuProps = {
  product: { id: string; sku: string; isActive: boolean };
  canWrite: boolean;
};

/** Row kebab for the products list: View, Edit, Deactivate / Reactivate (write roles only). */
export function ProductRowMenu({ product, canWrite }: ProductRowMenuProps) {
  const [pending, startTransition] = useTransition();

  const toggleActive = () => {
    startTransition(async () => {
      const result = await setProductActiveAction(product.id, !product.isActive, new FormData());
      if (result && !result.ok) toast.error(actionErrorMessage(result.error));
      else if (result?.ok) toast.success(result.message ?? "Saved");
    });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-xs" aria-label={`Actions for ${product.sku}`} disabled={pending}>
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem asChild>
          <Link href={`/products/${product.id}`}>
            <Eye />
            View
          </Link>
        </DropdownMenuItem>
        {canWrite ? (
          <>
            <DropdownMenuItem asChild>
              <Link href={`/products/${product.id}/edit`}>
                <Pencil />
                Edit
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={toggleActive}>
              {product.isActive ? <Archive /> : <ArchiveRestore />}
              {product.isActive ? "Deactivate" : "Reactivate"}
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
