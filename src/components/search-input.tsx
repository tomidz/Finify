"use client";

import * as React from "react";
import { Search, X } from "lucide-react";

import { useShortcut } from "@/lib/keyboard";
import { uiScale } from "@/lib/ui-scale";
import { cn } from "@/lib/utils";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  InputGroupText,
} from "@/components/ui/input-group";
import { Kbd } from "@/components/ui/kbd";

export type SearchInputProps = Omit<
  React.ComponentProps<"input">,
  "value" | "defaultValue" | "onChange" | "type" | "ref"
> & {
  /** The typed query, updated on every keystroke. Debounce with `useDebouncedValue` when it drives a fetch. */
  value: string;
  onValueChange: (next: string) => void;
  /** Rows found, shown as "12 resultados" while there is a query. */
  resultCount?: number;
  /** Focus the field with "/" from anywhere on the page. */
  shortcut?: boolean;
  /** Classes for the input itself; `className` sizes the whole field. */
  inputClassName?: string;
};

/** Toolbar search field: icon, clear button, optional result count and "/" shortcut. */
export function SearchInput({
  value,
  onValueChange,
  resultCount,
  shortcut = false,
  className,
  inputClassName,
  placeholder = "Buscar",
  onKeyDown,
  ...props
}: SearchInputProps) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const showCount = resultCount != null && value.trim() !== "";

  useShortcut(
    "/",
    () => {
      inputRef.current?.focus();
      inputRef.current?.select();
    },
    { enabled: shortcut },
  );

  const clear = () => {
    onValueChange("");
    inputRef.current?.focus();
  };

  return (
    <InputGroup className={cn("group/search", uiScale.field, className)}>
      <InputGroupAddon>
        <Search className="size-3.5" />
      </InputGroupAddon>
      <InputGroupInput
        ref={inputRef}
        type="text"
        enterKeyHint="search"
        autoComplete="off"
        aria-label={placeholder}
        placeholder={placeholder}
        value={value}
        onChange={(event) => onValueChange(event.target.value)}
        onKeyDown={(event) => {
          onKeyDown?.(event);
          if (event.defaultPrevented || event.key !== "Escape" || value === "") return;
          event.preventDefault();
          onValueChange("");
        }}
        className={inputClassName}
        {...props}
      />
      {value === "" && !shortcut ? null : (
        <InputGroupAddon align="inline-end">
          {value === "" ? (
            <Kbd className="group-focus-within/search:hidden">/</Kbd>
          ) : (
            <>
              {!showCount ? null : (
                <InputGroupText className="text-[11px] tabular-nums">
                  {resultCount.toLocaleString("es-AR")} {resultCount === 1 ? "resultado" : "resultados"}
                </InputGroupText>
              )}
              <InputGroupButton aria-label="Limpiar búsqueda" onClick={clear}>
                <X />
              </InputGroupButton>
            </>
          )}
        </InputGroupAddon>
      )}
    </InputGroup>
  );
}
