"use client";

import Link from "next/link";
import { ClipboardPlus, Eye, MoreHorizontal, Pencil } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export type CustomerRowMenuProps = {
  customer: { id: string; name: string; isActive: boolean };
  canWrite: boolean;
  canCreateOrder: boolean;
};

/** Row kebab: View, Edit, New order for this customer. */
export function CustomerRowMenu({ customer, canWrite, canCreateOrder }: CustomerRowMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-xs" aria-label={`Actions for ${customer.name}`}>
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem asChild>
          <Link href={`/customers/${customer.id}`}>
            <Eye />
            View
          </Link>
        </DropdownMenuItem>
        {canWrite ? (
          <DropdownMenuItem asChild>
            <Link href={`/customers/${customer.id}/edit`}>
              <Pencil />
              Edit
            </Link>
          </DropdownMenuItem>
        ) : null}
        {canCreateOrder && customer.isActive ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href={`/orders/new?customerId=${encodeURIComponent(customer.id)}`}>
                <ClipboardPlus />
                New order
              </Link>
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
