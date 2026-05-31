"use client";

import { useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  BUDGET_CATEGORY_LABELS,
  type BudgetCategory,
  type BudgetCategoryType,
} from "@/types/budget";

interface CategoryComboboxProps {
  categories: BudgetCategory[];
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  allowEmpty?: boolean;
  emptyLabel?: string;
  grouped?: boolean;
  disabled?: boolean;
  usageCounts?: Record<string, number>;
}

function sortByUsage<T extends { id: string }>(
  items: T[],
  counts: Record<string, number> | undefined
): T[] {
  if (!counts) return items;
  return [...items].sort(
    (a, b) => (counts[b.id] ?? 0) - (counts[a.id] ?? 0)
  );
}

export function CategoryCombobox({
  categories,
  value,
  onValueChange,
  placeholder = "Seleccionar categoría",
  allowEmpty = false,
  emptyLabel = "Sin categoría",
  grouped = false,
  disabled = false,
  usageCounts,
}: CategoryComboboxProps) {
  const [open, setOpen] = useState(false);

  const selectedCategory = categories.find((c) => c.id === value);
  const displayLabel = selectedCategory
    ? selectedCategory.name
    : value === ""
      ? allowEmpty
        ? emptyLabel
        : placeholder
      : placeholder;

  if (grouped) {
    const groups = new Map<BudgetCategoryType, BudgetCategory[]>();
    for (const cat of categories) {
      const existing = groups.get(cat.category_type) ?? [];
      existing.push(cat);
      groups.set(cat.category_type, existing);
    }
    // Sort categories within each group by usage
    for (const [type, cats] of groups) {
      groups.set(type, sortByUsage(cats, usageCounts));
    }

    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between font-normal"
            disabled={disabled}
          >
            <span className="truncate">{displayLabel}</span>
            <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start" portal={false}>
          <Command>
            <CommandInput placeholder="Buscar categoría..." />
            <CommandList>
              <CommandEmpty>No se encontraron categorías.</CommandEmpty>
              {allowEmpty && (
                <CommandGroup>
                  <CommandItem
                    value={emptyLabel}
                    onSelect={() => {
                      onValueChange("");
                      setOpen(false);
                    }}
                  >
                    <Check
                      className={cn(
                        "mr-2 size-4",
                        value === "" ? "opacity-100" : "opacity-0"
                      )}
                    />
                    {emptyLabel}
                  </CommandItem>
                </CommandGroup>
              )}
              {Array.from(groups.entries()).map(([type, cats]) => (
                <CommandGroup key={type} heading={BUDGET_CATEGORY_LABELS[type]}>
                  {cats.map((cat) => (
                    <CommandItem
                      key={cat.id}
                      value={cat.name}
                      onSelect={() => {
                        onValueChange(cat.id);
                        setOpen(false);
                      }}
                    >
                      <Check
                        className={cn(
                          "mr-2 size-4",
                          value === cat.id ? "opacity-100" : "opacity-0"
                        )}
                      />
                      {cat.name}
                    </CommandItem>
                  ))}
                </CommandGroup>
              ))}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal"
          disabled={disabled}
        >
          <span className="truncate">{displayLabel}</span>
          <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <Command>
          <CommandInput placeholder="Buscar categoría..." />
          <CommandList>
            <CommandEmpty>No se encontraron categorías.</CommandEmpty>
            {allowEmpty && (
              <CommandItem
                value={emptyLabel}
                onSelect={() => {
                  onValueChange("");
                  setOpen(false);
                }}
              >
                <Check
                  className={cn(
                    "mr-2 size-4",
                    value === "" ? "opacity-100" : "opacity-0"
                  )}
                />
                {emptyLabel}
              </CommandItem>
            )}
            {sortByUsage(categories, usageCounts).map((cat) => (
              <CommandItem
                key={cat.id}
                value={cat.name}
                onSelect={() => {
                  onValueChange(cat.id);
                  setOpen(false);
                }}
              >
                <Check
                  className={cn(
                    "mr-2 size-4",
                    value === cat.id ? "opacity-100" : "opacity-0"
                  )}
                />
                {cat.name}
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
