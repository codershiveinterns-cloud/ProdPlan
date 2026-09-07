"use client";

import { useState } from "react";
import Link from "next/link";
import { Eye, MoreHorizontal, Pencil, RefreshCw } from "lucide-react";

import type { OrderStatus } from "@/generated/prisma/enums";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import { StatusDialog } from "./StatusDialog";

export type OrderRowMenuProps = {
  order: { id: string; orderNumber: string; status: OrderStatus };
  canEdit: boolean;
  /** Legal status targets for the current user (computed on the server with `allowedTargets`). */
  targets: OrderStatus[];
};

/** Row kebab: View, Edit (if allowed), Change status (opens `StatusDialog`, per RBAC). */
export function OrderRowMenu({ order, canEdit, targets }: OrderRowMenuProps) {
  const [statusOpen, setStatusOpen] = useState(false);
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-xs" aria-label={`Actions for ${order.orderNumber}`}>
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem asChild>
            <Link href={`/orders/${order.id}`}>
              <Eye />
              View
            </Link>
          </DropdownMenuItem>
          {canEdit ? (
            <DropdownMenuItem asChild>
              <Link href={`/orders/${order.id}/edit`}>
                <Pencil />
                Edit
              </Link>
            </DropdownMenuItem>
          ) : null}
          {targets.length > 0 ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => setStatusOpen(true)}>
                <RefreshCw />
                Change status
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
      {targets.length > 0 ? (
        <StatusDialog
          open={statusOpen}
          onOpenChange={setStatusOpen}
          orderId={order.id}
          orderNumber={order.orderNumber}
          currentStatus={order.status}
          targets={targets}
        />
      ) : null}
    </>
  );
}
