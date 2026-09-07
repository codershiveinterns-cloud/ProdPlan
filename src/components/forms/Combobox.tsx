"use client";

import { useId, useMemo, useState } from "react";
import { ChevronsUpDown, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export type ComboboxOption = {
  value: string;
  label: string;
  /** Secondary text shown muted after the label (e.g. unit, code). */
  hint?: string;
};

export type ComboboxProps = {
  /** Name of the hidden input submitted with the form. */
  name: string;
  options: ComboboxOption[];
  defaultValue?: string;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  /** Offer `Create "{typed}"` as the last option; the hidden value becomes `new:<typed>`. */
  allowCreate?: boolean;
  createLabel?: (typed: string) => string;
  required?: boolean;
  disabled?: boolean;
  /** Forwarded to the trigger (FormField injects `id` and aria-* when Combobox is the only child). */
  id?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean | "true" | "false";
  "aria-required"?: boolean | "true" | "false";
  className?: string;
  /** Called when the value changes (e.g. to update a unit suffix elsewhere in the form). */
  onValueChange?: (value: string, option: ComboboxOption | null) => void;
};

export const CREATE_PREFIX = "new:";

/** `new:Acme Ltd` → "Acme Ltd"; anything else → null. */
export function parseCreateValue(value: string | null | undefined): string | null {
  return value && value.startsWith(CREATE_PREFIX) ? value.slice(CREATE_PREFIX.length) : null;
}

function normalise(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Searchable single-select built from Popover + cmdk. Renders a hidden `<input name>` so it works in plain
 * `<form action>` submissions. 44 px trigger. With `allowCreate`, picking `Create "X"` submits `new:X`, which the
 * server action resolves with `parseCreateValue()` / `findOrCreateCustomer()`.
 */
export function Combobox({
  name,
  options,
  defaultValue = "",
  placeholder = "Select…",
  searchPlaceholder = "Search…",
  emptyText = "No matches",
  allowCreate = false,
  createLabel = (typed) => `Create "${typed}"`,
  required,
  disabled,
  id,
  className,
  onValueChange,
  ...aria
}: ComboboxProps) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(defaultValue);
  const [query, setQuery] = useState("");
  const listId = useId();

  const selected = useMemo(() => options.find((option) => option.value === value) ?? null, [options, value]);
  const createdName = parseCreateValue(value);

  const filtered = useMemo(() => {
    const q = normalise(query);
    if (!q) return options;
    return options.filter((option) => normalise(`${option.label} ${option.hint ?? ""}`).includes(q));
  }, [options, query]);

  const typed = query.trim().replace(/\s+/g, " ");
  const exactExists = typed !== "" && options.some((option) => normalise(option.label) === normalise(typed));
  const showCreate = allowCreate && typed !== "" && !exactExists;

  const commit = (next: string) => {
    setValue(next);
    setOpen(false);
    setQuery("");
    onValueChange?.(next, options.find((option) => option.value === next) ?? null);
  };

  const display = selected ? (
    <span className="flex min-w-0 items-center gap-2">
      <span className="truncate">{selected.label}</span>
      {selected.hint ? <span className="truncate text-muted-foreground">{selected.hint}</span> : null}
    </span>
  ) : createdName ? (
    <span className="flex min-w-0 items-center gap-2">
      <span className="truncate">{createdName}</span>
      <span className="shrink-0 rounded-md bg-primary/10 px-1.5 py-0.5 text-xs font-medium text-primary">New</span>
    </span>
  ) : (
    <span className="text-muted-foreground">{placeholder}</span>
  );

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setQuery("");
      }}
    >
      <input type="hidden" name={name} value={value} />
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          id={id}
          aria-expanded={open}
          aria-controls={open ? listId : undefined}
          aria-haspopup="listbox"
          aria-required={aria["aria-required"] ?? (required || undefined)}
          aria-invalid={aria["aria-invalid"]}
          aria-describedby={aria["aria-describedby"]}
          disabled={disabled}
          className={cn(
            "w-full justify-between font-normal",
            "aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20",
            className,
          )}
        >
          {display}
          <ChevronsUpDown className="shrink-0 text-muted-foreground" aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-(--radix-popover-trigger-width) min-w-64 p-0">
        <Command shouldFilter={false} className="rounded-lg!">
          <CommandInput
            value={query}
            onValueChange={setQuery}
            placeholder={searchPlaceholder}
            aria-label={searchPlaceholder}
          />
          <CommandList id={listId}>
            {filtered.length === 0 && !showCreate ? <CommandEmpty>{emptyText}</CommandEmpty> : null}
            {filtered.length > 0 ? (
              <CommandGroup>
                {filtered.map((option) => (
                  // shadcn's CommandItem renders the trailing check icon from `data-checked`.
                  <CommandItem
                    key={option.value}
                    value={option.value}
                    onSelect={() => commit(option.value)}
                    data-checked={option.value === value}
                  >
                    <span className="truncate">{option.label}</span>
                    {option.hint ? <span className="truncate text-muted-foreground">{option.hint}</span> : null}
                  </CommandItem>
                ))}
              </CommandGroup>
            ) : null}
            {showCreate ? (
              <CommandGroup>
                <CommandItem
                  value={`${CREATE_PREFIX}${typed}`}
                  onSelect={() => commit(`${CREATE_PREFIX}${typed}`)}
                  className="text-primary data-selected:text-primary"
                >
                  <Plus className="size-4" aria-hidden="true" />
                  <span className="truncate">{createLabel(typed)}</span>
                </CommandItem>
              </CommandGroup>
            ) : null}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
