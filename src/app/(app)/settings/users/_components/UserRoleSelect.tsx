"use client";

import type { Role } from "@/generated/prisma/enums";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ROLE_LABELS } from "@/lib/rbac";

const ROLE_HINTS: Record<Role, string> = {
  ADMIN: "Everything, including users and plant settings",
  PLANNER: "Orders, master data, stock and calendars",
  SUPERVISOR: "Order status, stock movements and downtime",
  VIEWER: "Read-only access",
};

export const ROLE_OPTIONS = (Object.keys(ROLE_LABELS) as Role[]).map((role) => ({
  value: role,
  label: ROLE_LABELS[role],
  hint: ROLE_HINTS[role],
}));

export type UserRoleSelectProps = {
  id: string;
  name?: string;
  defaultValue?: Role;
  invalid?: boolean;
  describedBy?: string;
};

/** Role picker (44 px trigger) that posts `name` as a plain form value. */
export function UserRoleSelect({ id, name = "role", defaultValue, invalid, describedBy }: UserRoleSelectProps) {
  return (
    <Select name={name} defaultValue={defaultValue} required>
      <SelectTrigger id={id} className="w-full" aria-invalid={invalid || undefined} aria-describedby={describedBy}>
        <SelectValue placeholder="Select a role" />
      </SelectTrigger>
      <SelectContent>
        {ROLE_OPTIONS.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            <span className="flex flex-col gap-0.5">
              <span>{option.label}</span>
              <span className="text-xs text-muted-foreground">{option.hint}</span>
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
