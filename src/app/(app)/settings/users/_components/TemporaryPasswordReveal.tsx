"use client";

import { useState } from "react";
import { Check, Copy, ShieldAlert } from "lucide-react";
import { toast } from "sonner";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { DialogClose, DialogFooter } from "@/components/ui/dialog";

export type TemporaryPasswordRevealProps = {
  name: string;
  email: string;
  temporaryPassword: string;
};

/** The one-time reveal (spec §3): password + Copy + "Share this securely; it will not be shown again". */
export function TemporaryPasswordReveal({ name, email, temporaryPassword }: TemporaryPasswordRevealProps) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(temporaryPassword);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Could not copy automatically — select the password and copy it manually.");
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm">
        Temporary password for <span className="font-medium text-foreground">{name}</span>{" "}
        <span className="text-muted-foreground">({email})</span>:
      </p>
      <div className="flex items-center gap-2">
        <output
          aria-label="Temporary password"
          className="flex h-11 min-w-0 flex-1 items-center overflow-x-auto rounded-lg border border-input bg-muted px-3 font-mono text-base tracking-wide select-all"
        >
          {temporaryPassword}
        </output>
        <Button type="button" variant="outline" onClick={copy} aria-live="polite">
          {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
      <Alert>
        <ShieldAlert aria-hidden="true" />
        <AlertDescription>
          Share this securely; it will not be shown again. They will be asked to choose a new password at sign-in.
        </AlertDescription>
      </Alert>
      <DialogFooter>
        <DialogClose asChild>
          <Button type="button">Done</Button>
        </DialogClose>
      </DialogFooter>
    </div>
  );
}
