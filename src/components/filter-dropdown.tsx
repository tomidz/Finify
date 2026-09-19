"use client";

import * as React from "react";
import { Check, ChevronDown, X } from "lucide-react";

import { uiScale } from "@/lib/ui-scale";
import { cn } from "@/lib/utils";
import { filterByKeywords } from "@/components/command-filter";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export interface FilterOption {
  value: string;
  label: string;
}

interface FilterDropdownBaseProps {
  /** What is filtered ("Cuenta"): the trigger text and the prefix of the active value. */
  label: string;
  options: readonly FilterOption[];
  /** A search box over the options. Default: on past 8 options. */
  searchable?: boolean;
  /** Offer "Todos" to clear. Turn off for a choice that always has a value, like a view mode. */
  clearable?: boolean;
  disabled?: boolean;
  className?: string;
}

export type FilterDropdownProps = FilterDropdownBaseProps &
  (
    | {
        multiple?: false;
        /** null: no filter. */
        value: string | null;
        onValueChange: (value: string | null) => void;
      }
    | {
        multiple: true;
        /** []: no filter. */
        value: readonly string[];
        onValueChange: (value: string[]) => void;
      }
  );

// cmdk needs a value per item; option values are ids and enum keys.
const ALL_VALUE = "__all__";

/** A compact filter button: shows the label, then the picked value or how many are picked. */
export function FilterDropdown(props: FilterDropdownProps) {
  const { label, options, searchable = options.length > 8, clearable = true, disabled, className } = props;
  const [open, setOpen] = React.useState(false);
  const commandRef = React.useRef<HTMLDivElement>(null);

  const selected = props.multiple ? props.value : props.value == null ? [] : [props.value];
  const selectedLabels = options.filter((option) => selected.includes(option.value)).map((option) => option.label);
  const active = clearable && selected.length > 0;

  const choose = (value: string) => {
    if (!props.multiple) {
      props.onValueChange(value);
      setOpen(false);
      return;
    }
    props.onValueChange(
      props.value.includes(value) ? props.value.filter((v) => v !== value) : [...props.value, value],
    );
  };

  const clear = () => {
    if (props.multiple) props.onValueChange([]);
    else props.onValueChange(null);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          disabled={disabled}
          data-active={active || undefined}
          className={cn(uiScale.trigger, "max-w-full font-normal data-[active]:border-foreground/30 dark:data-[active]:border-foreground/30", className)}
        >
          {selected.length === 0 ? (
            <span className="truncate">{label}</span>
          ) : (
            <>
              <span className="text-muted-foreground shrink-0">{label}:</span>
              {selected.length === 1 && selectedLabels.length === 1 ? (
                <span className="max-w-40 truncate">{selectedLabels[0]}</span>
              ) : (
                // Several picked, or a value no longer among the options.
                <span className="tabular-nums">{selected.length}</span>
              )}
            </>
          )}
          <ChevronDown className="text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-56 p-0"
        // Without a search box, focus the list itself so arrows and Enter pick.
        onOpenAutoFocus={(event) => {
          if (searchable) return;
          event.preventDefault();
          commandRef.current?.focus();
        }}
      >
        <Command ref={commandRef} filter={filterByKeywords}>
          {!searchable ? null : <CommandInput placeholder="Buscar" className="h-9 text-xs" />}
          <CommandList className="max-h-64">
            <CommandEmpty className="text-muted-foreground py-4 text-center text-xs">Sin resultados</CommandEmpty>
            <CommandGroup>
              {!clearable ? null : (
                <CommandItem value={ALL_VALUE} keywords={["Todos"]} onSelect={clear} className="text-xs">
                  <Check className={cn("size-3.5", selected.length === 0 ? "opacity-100" : "opacity-0")} />
                  Todos
                </CommandItem>
              )}
              {options.map((option) => (
                <CommandItem
                  key={option.value}
                  value={option.value}
                  keywords={[option.label]}
                  onSelect={() => choose(option.value)}
                  className="text-xs"
                >
                  <Check className={cn("size-3.5", selected.includes(option.value) ? "opacity-100" : "opacity-0")} />
                  <span className="truncate">{option.label}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export interface FilterChip {
  /** Stable key, e.g. the filter's param name. */
  id: string;
  label: string;
  value: string;
  onRemove: () => void;
}

/** The active filters as removable chips, plus "Limpiar". Renders nothing without chips. */
export function FilterChipBar({
  chips,
  onClearAll,
  className,
}: {
  chips: readonly FilterChip[];
  onClearAll: () => void;
  className?: string;
}) {
  if (chips.length === 0) return null;
  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      {chips.map((chip) => (
        <span
          key={chip.id}
          className="bg-muted/50 inline-flex h-6 max-w-full items-center gap-1 rounded-md border pr-0.5 pl-2 text-xs"
        >
          <span className="text-muted-foreground shrink-0">{chip.label}:</span>
          <span className="max-w-40 truncate">{chip.value}</span>
          <button
            type="button"
            aria-label={`Quitar ${chip.label}`}
            onClick={chip.onRemove}
            className="text-muted-foreground hover:text-foreground hover:bg-accent focus-visible:ring-ring/50 rounded-sm p-0.5 outline-none focus-visible:ring-2"
          >
            <X className="size-3" />
          </button>
        </span>
      ))}
      <Button variant="ghost" size="xs" onClick={onClearAll} className="text-muted-foreground">
        Limpiar
      </Button>
    </div>
  );
}
