"use client";

import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useDebouncedCallback } from "@/hooks/use-debounced-callback";
import { cn } from "@/lib/utils";

export type SearchInputProps = {
  /** Query-string key; the list URL contract uses `q`. */
  name?: string;
  placeholder?: string;
  defaultValue?: string;
  /** Accessible name; defaults to the placeholder or "Search". */
  label?: string;
  className?: string;
};

/**
 * Debounced (300 ms) search box that writes `?q=` into the URL and resets `page` to 1, keeping every other
 * filter. Enter applies immediately; the clear button removes the parameter.
 */
export function SearchInput({
  name = "q",
  placeholder = "Search…",
  defaultValue = "",
  label,
  className,
}: SearchInputProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [value, setValue] = useState(defaultValue);
  const [seenDefault, setSeenDefault] = useState(defaultValue);

  // Reflect external changes (e.g. a "Clear filters" link) — the documented "adjust state on prop change"
  // pattern (state updated during render, no effect).
  if (seenDefault !== defaultValue) {
    setSeenDefault(defaultValue);
    setValue(defaultValue);
  }

  const apply = (next: string) => {
    const params = new URLSearchParams(searchParams.toString());
    const trimmed = next.trim();
    if (trimmed) params.set(name, trimmed);
    else params.delete(name);
    params.delete("page");
    if ((params.get(name) ?? "") === (searchParams.get(name) ?? "")) return;
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  };

  const debounced = useDebouncedCallback(apply, 300);

  const inputId = `search-${name}`;

  return (
    <div className={cn("relative w-full max-w-sm", className)}>
      <label htmlFor={inputId} className="sr-only">
        {label ?? placeholder ?? "Search"}
      </label>
      <Search
        className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden="true"
      />
      <Input
        id={inputId}
        type="search"
        name={name}
        value={value}
        placeholder={placeholder}
        autoComplete="off"
        enterKeyHint="search"
        className="pl-10 pr-11 [&::-webkit-search-cancel-button]:appearance-none"
        onChange={(event) => {
          setValue(event.target.value);
          debounced.run(event.target.value);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            debounced.cancel();
            apply(value);
          }
        }}
      />
      {value ? (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="absolute top-1/2 right-1 -translate-y-1/2 text-muted-foreground"
          aria-label="Clear search"
          onClick={() => {
            debounced.cancel();
            setValue("");
            apply("");
          }}
        >
          <X />
        </Button>
      ) : null}
    </div>
  );
}
