"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { Info, Lock } from "lucide-react";

import type { OrderPriority, OrderStatus } from "@/generated/prisma/enums";
import { ORDER_PRIORITY_META } from "@/components/data/PriorityBadge";
import { Combobox, type ComboboxOption } from "@/components/forms/Combobox";
import { DateInput } from "@/components/forms/DateInput";
import { FieldErrors } from "@/components/forms/FieldErrors";
import { FormField } from "@/components/forms/FormField";
import { SubmitButton } from "@/components/forms/SubmitButton";
import { ToastOnResult } from "@/components/forms/ToastOnResult";
import { actionErrorMessage, fieldErrorsFor } from "@/components/forms/action-state";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput, InputGroupText } from "@/components/ui/input-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ORDER_EDITABLE_FIELDS, ORDER_PRIORITIES, type OrderEditableField } from "@/lib/orders/status";
import { createOrderAction, updateOrderAction } from "@/app/(app)/orders/actions";

import { useFormDraft } from "./use-form-draft";

export type ProductOption = ComboboxOption & { unit: string };

/** Plain values of the order being edited (dates as `YYYY-MM-DD`). */
export type OrderFormValues = {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  customerId: string;
  customerName: string;
  productId: string;
  productLabel: string;
  productUnit: string;
  quantity: number;
  priority: OrderPriority;
  dueDate: string;
  earliestStartDate: string | null;
  customerPoRef: string | null;
  notes: string | null;
};

export type OrderFormProps = {
  mode: "create" | "edit";
  customers: ComboboxOption[];
  products: ProductOption[];
  /** `todayInTz(tenant.timezone)` — minimum due date on create. */
  today: string;
  /** Preview of the next automatic number (create only). */
  nextOrderNumber?: string;
  /** `?customerId=` prefill (create only). */
  defaultCustomerId?: string;
  order?: OrderFormValues;
  /** Fields still editable for the order's status (edit only). */
  editable?: OrderEditableField[];
  cancelHref: string;
};

function LockedValue({ label, htmlFor, value, hint }: { label: string; htmlFor: string; value: string; hint: string }) {
  return (
    <FormField
      label={label}
      htmlFor={htmlFor}
      hint={
        <span className="inline-flex items-center gap-1">
          <Lock className="size-3" aria-hidden="true" />
          {hint}
        </span>
      }
    >
      <div className="flex h-11 items-center rounded-lg border border-input bg-muted/60 px-3 text-sm">{value}</div>
    </FormField>
  );
}

/**
 * Create / edit order form (docs/M1_SPEC.md §6.1 field order). Locked fields (per `editableFields(status)`) are
 * rendered read-only and filled in server-side; terminal orders show a banner and only the notes field.
 */
export function OrderForm({ mode, customers, products, today, nextOrderNumber, defaultCustomerId, order, editable, cancelHref }: OrderFormProps) {
  const [state, formAction] = useActionState(mode === "create" ? createOrderAction : updateOrderAction, null);
  const { formKey, onSubmit, value } = useFormDraft(state);

  const editableSet = new Set<OrderEditableField>(editable ?? ORDER_EDITABLE_FIELDS);
  const terminal = mode === "edit" && order !== undefined && !editableSet.has("quantity");
  const locked = mode === "edit" && !terminal && !editableSet.has("customerId");
  const lockHint = "Locked once the order has started";

  const initialProductId = value("productId", order?.productId ?? "");
  const initialProduct = products.find((p) => p.value === initialProductId);
  const [unit, setUnit] = useState(initialProduct?.unit ?? order?.productUnit ?? "pcs");
  const [manualNumber, setManualNumber] = useState(mode === "edit" || Boolean(value("orderNumber", "")));
  const numberErrors = fieldErrorsFor(state, "orderNumber");
  const showManualNumber = manualNumber || Boolean(numberErrors);

  const formError = state && !state.ok && !state.fieldErrors ? actionErrorMessage(state.error) : null;

  const footer = (
    <div className="sticky bottom-0 -mx-4 flex justify-end gap-2 border-t bg-background/95 px-4 py-3 backdrop-blur md:static md:mx-0 md:border-0 md:bg-transparent md:p-0">
      <Button variant="outline" asChild>
        <Link href={cancelHref}>Cancel</Link>
      </Button>
      <SubmitButton pendingText="Saving…">{mode === "create" ? "Create order" : "Save order"}</SubmitButton>
    </div>
  );

  if (terminal && order) {
    return (
      <form key={formKey} action={formAction} onSubmit={onSubmit} noValidate className="flex flex-col gap-6">
        <ToastOnResult state={state} successMessage="Order saved" />
        <input type="hidden" name="orderId" value={order.id} />
        <Alert role="status">
          <Info aria-hidden="true" />
          <AlertTitle>This order is {order.status === "COMPLETED" ? "completed" : "cancelled"}</AlertTitle>
          <AlertDescription>Only the notes can be edited. An admin can reopen the order from its detail page.</AlertDescription>
        </Alert>
        {formError ? <FieldErrors errors={[formError]} /> : null}
        <FormField label="Notes" htmlFor="notes" errors={fieldErrorsFor(state, "notes")}>
          <Textarea name="notes" rows={5} maxLength={2000} defaultValue={value("notes", order.notes)} />
        </FormField>
        {footer}
      </form>
    );
  }

  return (
    <form key={formKey} action={formAction} onSubmit={onSubmit} noValidate className="flex flex-col gap-6">
      <ToastOnResult state={state} successMessage={mode === "create" ? "Order created" : "Order saved"} />
      {order ? <input type="hidden" name="orderId" value={order.id} /> : null}
      {locked ? (
        <Alert role="status">
          <Info aria-hidden="true" />
          <AlertTitle>This order has started</AlertTitle>
          <AlertDescription>Customer, product and order number are locked. Quantity, dates, priority, PO ref and notes can still change.</AlertDescription>
        </Alert>
      ) : null}
      {formError ? <FieldErrors errors={[formError]} /> : null}

      <div className="grid gap-5 md:grid-cols-2">
        {locked && order ? (
          <LockedValue label="Customer" htmlFor="customer" value={order.customerName} hint={lockHint} />
        ) : (
          <FormField
            label="Customer"
            htmlFor="customer"
            required
            description={customers.length === 0 ? "No customers yet — type a name and choose Create to add one." : undefined}
            errors={fieldErrorsFor(state, "customer")}
          >
            <Combobox
              name="customer"
              options={customers}
              defaultValue={value("customer", order?.customerId ?? defaultCustomerId ?? "")}
              placeholder="Select or create a customer"
              searchPlaceholder="Search customers…"
              allowCreate
              createLabel={(typed) => `Create "${typed}"`}
              required
            />
          </FormField>
        )}

        <FormField label="Customer PO ref" htmlFor="customerPoRef" hint="Optional" errors={fieldErrorsFor(state, "customerPoRef")}>
          <Input name="customerPoRef" maxLength={64} defaultValue={value("customerPoRef", order?.customerPoRef)} autoComplete="off" />
        </FormField>

        {locked && order ? (
          <LockedValue label="Product" htmlFor="productId" value={order.productLabel} hint={lockHint} />
        ) : products.length === 0 ? (
          <FormField label="Product" htmlFor="productId" required errors={fieldErrorsFor(state, "productId")}>
            <div className="flex h-11 items-center gap-2 rounded-lg border border-dashed border-input px-3 text-sm text-muted-foreground">
              No products yet —{" "}
              <Link href={`/products/new?return=${encodeURIComponent(mode === "create" ? "/orders/new" : cancelHref)}`} className="font-medium text-primary underline-offset-4 hover:underline">
                Create one
              </Link>
            </div>
          </FormField>
        ) : (
          <FormField label="Product" htmlFor="productId" required errors={fieldErrorsFor(state, "productId")}>
            <Combobox
              name="productId"
              options={products}
              defaultValue={initialProductId}
              placeholder="Select a product"
              searchPlaceholder="Search by SKU or name…"
              required
              onValueChange={(_value, option) => setUnit((option as ProductOption | null)?.unit ?? "pcs")}
            />
          </FormField>
        )}

        <FormField
          label="Quantity"
          htmlFor="quantity"
          required
          description="Enter a quantity greater than 0"
          errors={fieldErrorsFor(state, "quantity")}
        >
          <InputGroup id="quantity-group" className="md:w-64">
            <InputGroupInput
              id="quantity"
              name="quantity"
              type="number"
              inputMode="decimal"
              step="0.001"
              min="0"
              defaultValue={value("quantity", order ? String(order.quantity) : "")}
              aria-describedby={["quantity-description", fieldErrorsFor(state, "quantity") ? "quantity-error" : null].filter(Boolean).join(" ")}
              aria-invalid={fieldErrorsFor(state, "quantity") ? true : undefined}
              aria-required="true"
            />
            <InputGroupAddon align="inline-end">
              <InputGroupText>{unit}</InputGroupText>
            </InputGroupAddon>
          </InputGroup>
        </FormField>

        <FormField
          label="Due date"
          htmlFor="dueDate"
          required
          description={mode === "create" ? "Due date cannot be in the past" : undefined}
          errors={fieldErrorsFor(state, "dueDate")}
        >
          <DateInput name="dueDate" min={mode === "create" ? today : undefined} defaultValue={value("dueDate", order?.dueDate)} required />
        </FormField>

        <FormField label="Start not before" htmlFor="earliestStartDate" hint="Optional" errors={fieldErrorsFor(state, "earliestStartDate")}>
          <DateInput name="earliestStartDate" defaultValue={value("earliestStartDate", order?.earliestStartDate)} />
        </FormField>

        <FormField label="Priority" htmlFor="priority" errors={fieldErrorsFor(state, "priority")}>
          <div id="priority-field">
            <Select name="priority" defaultValue={value("priority", order?.priority ?? "NORMAL")}>
              <SelectTrigger id="priority" className="w-full md:w-64" aria-label="Priority">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ORDER_PRIORITIES.map((p) => (
                  <SelectItem key={p} value={p}>
                    {ORDER_PRIORITY_META[p].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </FormField>

        {locked && order ? (
          <LockedValue label="Order number" htmlFor="orderNumber" value={order.orderNumber} hint={lockHint} />
        ) : (
          <FormField
            label="Order number"
            htmlFor="orderNumber"
            hint={mode === "create" ? "Optional" : undefined}
            description={showManualNumber ? "3–32 characters: letters, digits and . _ / -" : undefined}
            errors={numberErrors}
          >
            {showManualNumber ? (
              <InputGroup id="orderNumber-group">
                <InputGroupInput
                  id="orderNumber"
                  name="orderNumber"
                  defaultValue={value("orderNumber", order?.orderNumber)}
                  placeholder={mode === "create" ? "e.g. CUST-2026-001" : undefined}
                  className="font-mono uppercase"
                  autoComplete="off"
                  maxLength={32}
                  aria-invalid={numberErrors ? true : undefined}
                  aria-describedby={[showManualNumber ? "orderNumber-description" : null, numberErrors ? "orderNumber-error" : null].filter(Boolean).join(" ") || undefined}
                />
                {mode === "create" ? (
                  <InputGroupAddon align="inline-end">
                    <InputGroupButton onClick={() => setManualNumber(false)}>Use automatic</InputGroupButton>
                  </InputGroupAddon>
                ) : null}
              </InputGroup>
            ) : (
              <div className="flex h-11 items-center justify-between gap-2 rounded-lg border border-dashed border-input px-3 text-sm">
                <span className="truncate">
                  Auto — next <span className="font-mono font-medium">{nextOrderNumber}</span>
                </span>
                <Button type="button" variant="link" size="sm" className="px-1" onClick={() => setManualNumber(true)}>
                  Set manually
                </Button>
              </div>
            )}
          </FormField>
        )}

        <FormField label="Notes" htmlFor="notes" hint="Optional" errors={fieldErrorsFor(state, "notes")} className="md:col-span-2">
          <Textarea name="notes" rows={4} maxLength={2000} defaultValue={value("notes", order?.notes)} />
        </FormField>
      </div>

      {footer}
    </form>
  );
}
