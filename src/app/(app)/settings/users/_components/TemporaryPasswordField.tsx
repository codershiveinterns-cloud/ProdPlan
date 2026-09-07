"use client";

import { useState } from "react";
import { RefreshCw } from "lucide-react";

import { FormField } from "@/components/forms/FormField";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { generateTemporaryPassword, TEMPORARY_PASSWORD_LENGTH } from "@/lib/users/temporary-password";

export type TemporaryPasswordFieldProps = {
  id: string;
  errors?: string[];
  autoFocus?: boolean;
};

/**
 * Optional temporary password with a "Generate" button. Left blank, the server generates one; either way the
 * value is shown exactly once after the action succeeds.
 */
export function TemporaryPasswordField({ id, errors, autoFocus }: TemporaryPasswordFieldProps) {
  const [value, setValue] = useState("");
  return (
    <FormField
      label="Temporary password"
      htmlFor={id}
      hint="Optional"
      description={`Leave blank to generate a ${TEMPORARY_PASSWORD_LENGTH}-character password. The user must change it at their first sign-in.`}
      errors={errors}
    >
      <div className="flex gap-2">
        <Input
          name="temporaryPassword"
          type="text"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          minLength={8}
          maxLength={72}
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          autoFocus={autoFocus}
          className="font-mono"
          placeholder="Generated if left blank"
        />
        <Button type="button" variant="outline" onClick={() => setValue(generateTemporaryPassword())}>
          <RefreshCw aria-hidden="true" />
          Generate
        </Button>
      </div>
    </FormField>
  );
}
