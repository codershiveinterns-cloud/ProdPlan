"use client";

import Link from "next/link";
import { ChevronDown, Plus } from "lucide-react";

import type { Role } from "@/generated/prisma/enums";
import { can } from "@/lib/rbac";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import { NEW_MENU_ITEMS } from "./nav";

/** Topbar "+ New" quick-create menu (Order, Customer, Product, Material, Machine), filtered by `can()`. */
export function NewMenu({ role }: { role: Role }) {
  const items = NEW_MENU_ITEMS.filter((item) => can(role, item.permission));
  if (items.length === 0) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="default" className="px-3 md:px-4" aria-label="Create new record">
          <Plus className="size-5 md:size-4" />
          <span className="hidden md:inline">New</span>
          <ChevronDown className="hidden size-4 opacity-70 md:inline" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-48">
        <DropdownMenuLabel>Create new</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <DropdownMenuItem key={item.href} asChild>
              <Link href={item.href}>
                <Icon className="text-muted-foreground" aria-hidden="true" />
                {item.label}
              </Link>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
