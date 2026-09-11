"use client";

/**
 * "Run schedule" toolbar action (docs/M2_SPEC.md §3): horizon select (14/30/60, blank = tenant default), calls
 * `runScheduleAction` (`schedule:run`). Used both in the toolbar and the dirty banner.
 */
import { useActionState, useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { runScheduleAction } from "@/app/(app)/schedule/actions";
import { FieldErrors } from "@/components/forms/FieldErrors";
import { FormField } from "@/components/forms/FormField";
import { SubmitButton } from "@/components/forms/SubmitButton";
import { actionErrorMessage, type ActionState } from "@/components/forms/action-state";
import { Button, type buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { VariantProps } from "class-variance-authority";

const HORIZON_OPTIONS = [14, 30, 60] as const;

export function RunScheduleButton({ variant = "default", label = "Run schedule" }: { variant?: VariantProps<typeof buttonVariants>["variant"]; label?: string }) {
  const [open, setOpen] = useState(false);
  const [horizon, setHorizon] = useState<string>("");
  const [state, formAction] = useActionState(runScheduleAction, null);
  const router = useRouter();
  const handled = useRef<ActionState>(null);
  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!state || handled.current === state) return;
    handled.current = state;
    if (state.ok) {
      toast.success(state.message ?? "Schedule updated");
      // Same "close the dialog once the action succeeds" pattern as StatusDialog; here the dialog is
      // uncontrolled (no parent-supplied onOpenChange indirection), so the setState call is direct.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      close();
      router.refresh();
    }
  }, [state, router, close]);

  const failed = state && !state.ok ? state : null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={variant}>
          <RefreshCw data-icon="inline-start" />
          {label}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Run schedule</DialogTitle>
          <DialogDescription>
            Re-sequences every open order against machine capacity and material availability. Manually placed
            (locked) operations are kept where they are.
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} className="flex flex-col gap-4">
          <FormField label="Horizon" htmlFor="run-horizon" hint="Optional — defaults to the plant's setting">
            <input type="hidden" name="horizonDays" value={horizon} />
            <Select value={horizon || "default"} onValueChange={(v) => setHorizon(v === "default" ? "" : v)}>
              <SelectTrigger id="run-horizon" className="w-full" aria-label="Horizon">
                <SelectValue placeholder="Plant default" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="default">Plant default</SelectItem>
                {HORIZON_OPTIONS.map((d) => (
                  <SelectItem key={d} value={String(d)}>
                    {d} days
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
          {failed ? <FieldErrors errors={[actionErrorMessage(failed.error)]} /> : null}
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            <SubmitButton pendingText="Running…">Run schedule</SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
