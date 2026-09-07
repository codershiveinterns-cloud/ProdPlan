"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { ok, parseForm, withAction } from "@/lib/action";
import { requirePermission } from "@/lib/auth/guards";
import { createCustomer, deleteCustomer, setCustomerActive, updateCustomer } from "@/lib/customers";
import { idField } from "@/lib/validation/common";
import { customerSchema } from "@/lib/validation/customers";

function revalidateCustomers(id?: string): void {
  revalidatePath("/customers");
  revalidatePath("/orders");
  if (id) revalidatePath(`/customers/${id}`);
}

export const createCustomerAction = withAction(async (formData) => {
  const { session, db } = await requirePermission("customers:write");
  const input = parseForm(customerSchema, formData);
  const customer = await createCustomer(db, session, input);
  revalidateCustomers(customer.id);
  redirect(`/customers/${customer.id}?flash=customer-created`);
});

export const updateCustomerAction = withAction(async (formData) => {
  const { session, db } = await requirePermission("customers:write");
  const id = idField("customer").parse(formData.get("customerId"));
  const input = parseForm(customerSchema, formData);
  await updateCustomer(db, session, id, input);
  revalidateCustomers(id);
  redirect(`/customers/${id}?flash=customer-updated`);
});

export const deleteCustomerAction = withAction(async (formData) => {
  const { session, db } = await requirePermission("customers:write");
  const id = idField("customer").parse(formData.get("customerId"));
  await deleteCustomer(db, session, id);
  revalidateCustomers();
  redirect("/customers?flash=customer-deleted");
});

export const setCustomerActiveAction = withAction(async (formData) => {
  const { session, db } = await requirePermission("customers:write");
  const id = idField("customer").parse(formData.get("customerId"));
  const isActive = formData.get("isActive") === "true";
  const customer = await setCustomerActive(db, session, id, isActive);
  revalidateCustomers(id);
  return ok(undefined, `${customer.name} ${isActive ? "reactivated" : "deactivated"}`);
});
