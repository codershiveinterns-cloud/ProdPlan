"use client";

import { Archive, ArchiveRestore, Trash2 } from "lucide-react";

import { ConfirmDialog } from "@/components/data/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { deleteCustomerAction, setCustomerActiveAction } from "@/app/(app)/customers/actions";

export type CustomerDangerZoneProps = {
  customer: { id: string; name: string; isActive: boolean };
  /** Number of orders referencing the customer — hard delete is offered only when it is 0. */
  orderCount: number;
};

/** Delete (unreferenced customers) or Deactivate / Reactivate (docs/M1_SPEC.md §4 "Delete vs deactivate"). */
export function CustomerDangerZone({ customer, orderCount }: CustomerDangerZoneProps) {
  const withId = (formData: FormData) => {
    formData.set("customerId", customer.id);
    return formData;
  };
  if (orderCount === 0) {
    return (
      <div className="flex flex-wrap gap-2">
        <ConfirmDialog
          trigger={
            <Button variant="destructive">
              <Trash2 data-icon="inline-start" />
              Delete customer
            </Button>
          }
          title={`Delete ${customer.name}?`}
          description="This customer has no orders. Deleting it cannot be undone."
          confirmLabel="Delete"
          destructive
          action={(formData) => deleteCustomerAction(null, withId(formData))}
        />
        <ConfirmDialog
          trigger={
            <Button variant="outline">
              {customer.isActive ? <Archive data-icon="inline-start" /> : <ArchiveRestore data-icon="inline-start" />}
              {customer.isActive ? "Deactivate" : "Reactivate"}
            </Button>
          }
          title={`${customer.isActive ? "Deactivate" : "Reactivate"} ${customer.name}?`}
          description={
            customer.isActive
              ? "The customer is hidden from the order form and the CSV import matcher. Existing orders keep their link."
              : "The customer becomes selectable again on the order form."
          }
          confirmLabel={customer.isActive ? "Deactivate" : "Reactivate"}
          action={(formData) => {
            formData.set("isActive", customer.isActive ? "false" : "true");
            return setCustomerActiveAction(null, withId(formData));
          }}
        />
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        {customer.name} has {orderCount.toLocaleString("en-IN")} order{orderCount === 1 ? "" : "s"}, so it cannot be deleted.{" "}
        {customer.isActive ? "Deactivate it to hide it from pickers." : "It is currently inactive."}
      </p>
      <div>
        <ConfirmDialog
          trigger={
            <Button variant={customer.isActive ? "destructive" : "outline"}>
              {customer.isActive ? <Archive data-icon="inline-start" /> : <ArchiveRestore data-icon="inline-start" />}
              {customer.isActive ? "Deactivate" : "Reactivate"}
            </Button>
          }
          title={`${customer.isActive ? "Deactivate" : "Reactivate"} ${customer.name}?`}
          description={
            customer.isActive
              ? "The customer is hidden from the order form and the CSV import matcher. Existing orders keep their link."
              : "The customer becomes selectable again on the order form."
          }
          confirmLabel={customer.isActive ? "Deactivate" : "Reactivate"}
          destructive={customer.isActive}
          action={(formData) => {
            formData.set("isActive", customer.isActive ? "false" : "true");
            return setCustomerActiveAction(null, withId(formData));
          }}
        />
      </div>
    </div>
  );
}
