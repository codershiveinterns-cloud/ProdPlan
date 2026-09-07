"use client";

import { useRef } from "react";
import Link from "next/link";
import { ChevronDown, LogOut, UserRound } from "lucide-react";

import { ROLE_LABELS } from "@/lib/rbac";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import type { AppShellUser, LogoutAction } from "./AppShell";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return (first + last).toUpperCase();
}

/**
 * Topbar user menu: name, role badge, Profile link and Sign out. Sign out submits a hidden form bound to the
 * passed Server Action (`logoutAction`), so it works with the keyboard (Enter on the item) and without JS-heavy
 * client logic.
 */
export function UserMenu({ user, logoutAction }: { user: AppShellUser; logoutAction: LogoutAction }) {
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <>
      <form ref={formRef} action={logoutAction} className="hidden" aria-hidden="true" />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            className="h-11 gap-2 px-1.5 md:px-2"
            aria-label={`Account menu for ${user.name}`}
          >
            <span
              aria-hidden="true"
              className="flex size-8 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-semibold text-secondary-foreground"
            >
              {initials(user.name)}
            </span>
            <span className="hidden max-w-40 truncate text-sm font-medium md:inline">{user.name}</span>
            <ChevronDown className="hidden size-4 opacity-70 md:inline" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-60">
          <DropdownMenuLabel className="flex flex-col gap-1.5 py-2">
            <span className="truncate text-sm font-medium text-foreground">{user.name}</span>
            <span className="truncate text-xs font-normal text-muted-foreground">{user.email}</span>
            <Badge variant="secondary" className="mt-0.5 w-fit">
              {ROLE_LABELS[user.role]}
            </Badge>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link href="/settings/profile">
              <UserRound className="text-muted-foreground" aria-hidden="true" />
              Profile
            </Link>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={() => {
              formRef.current?.requestSubmit();
            }}
          >
            <LogOut className="text-muted-foreground" aria-hidden="true" />
            Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
