"use client";

import { useActionState, useEffect, useRef } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { toast } from "sonner";

import { SubmitButton } from "@/components/forms/SubmitButton";
import { actionErrorMessage, type ActionState } from "@/components/forms/action-state";

import { moveOperationAction } from "../actions";

export type MoveButtonsProps = {
  productId: string;
  operationId: string;
  label: string;
  canMoveUp: boolean;
  canMoveDown: boolean;
};

/** Up / Down 44 px icon buttons (spec §6.5: no drag-and-drop in M1). Each is its own tiny form. */
export function MoveButtons({ productId, operationId, label, canMoveUp, canMoveDown }: MoveButtonsProps) {
  const [state, formAction] = useActionState(moveOperationAction, null);

  const handled = useRef<ActionState>(null);
  useEffect(() => {
    if (!state || handled.current === state) return;
    handled.current = state;
    if (!state.ok) toast.error(actionErrorMessage(state.error));
  }, [state]);

  const hidden = (
    <>
      <input type="hidden" name="productId" value={productId} />
      <input type="hidden" name="operationId" value={operationId} />
    </>
  );

  return (
    <div className="flex items-center gap-1">
      <form action={formAction}>
        {hidden}
        <input type="hidden" name="direction" value="up" />
        <SubmitButton variant="outline" size="icon" disabled={!canMoveUp} aria-label={`Move ${label} up`} pendingText="">
          <ArrowUp />
        </SubmitButton>
      </form>
      <form action={formAction}>
        {hidden}
        <input type="hidden" name="direction" value="down" />
        <SubmitButton variant="outline" size="icon" disabled={!canMoveDown} aria-label={`Move ${label} down`} pendingText="">
          <ArrowDown />
        </SubmitButton>
      </form>
    </div>
  );
}
