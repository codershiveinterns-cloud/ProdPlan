"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";

import type { Role } from "@/generated/prisma/enums";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

import { Brand } from "./Brand";
import { SidebarNav } from "./SidebarNav";

/** Hamburger + left Sheet with the sidebar navigation; only rendered below lg. Closes on navigation. */
export function MobileNav({ role, tenantName }: { role: Role; tenantName: string }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const [seenPath, setSeenPath] = useState(pathname);

  // Close after a route change (covers back/forward navigation too) — state adjusted during render, no effect.
  if (seenPath !== pathname) {
    setSeenPath(pathname);
    setOpen(false);
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open navigation">
          <Menu className="size-5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-72 gap-0 p-0 sm:max-w-72">
        <SheetHeader className="sr-only">
          <SheetTitle>Navigation</SheetTitle>
          <SheetDescription>Main navigation for {tenantName}</SheetDescription>
        </SheetHeader>
        <Brand tenantName={tenantName} className="border-b" />
        <div className="flex-1 overflow-y-auto py-3">
          <SidebarNav role={role} onNavigate={() => setOpen(false)} />
        </div>
      </SheetContent>
    </Sheet>
  );
}
