"use client";

import { useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatAmount } from "@/lib/format";
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
import type { Account } from "@/types/accounts";

interface AccountComboboxProps {
  accounts: Account[];
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  /** Optional balance per account id (in the account's own currency). */
  balanceByAccount?: Record<string, number>;
}

export function AccountCombobox({
  accounts,
  value,
  onValueChange,
  placeholder = "Seleccionar cuenta",
  disabled = false,
  balanceByAccount,
}: AccountComboboxProps) {
  const [open, setOpen] = useState(false);

  const selectedAccount = accounts.find((a) => a.id === value);
  const selectedBalance =
    selectedAccount && balanceByAccount
      ? balanceByAccount[selectedAccount.id]
      : undefined;
  const displayLabel = selectedAccount
    ? `${selectedAccount.name} (${selectedAccount.currency})${
        selectedBalance != null ? ` · ${formatAmount(selectedBalance)}` : ""
      }`
    : placeholder;

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
      <PopoverContent
        className="w-[var(--radix-popover-trigger-width)] p-0"
        align="start"
        portal={false}
      >
        <Command>
          <CommandInput placeholder="Buscar cuenta..." />
          <CommandList>
            <CommandEmpty>No se encontraron cuentas.</CommandEmpty>
            <CommandGroup>
              {accounts.map((account) => {
                const balance = balanceByAccount?.[account.id];
                return (
                  <CommandItem
                    key={account.id}
                    value={`${account.name} (${account.currency})`}
                    onSelect={() => {
                      onValueChange(account.id);
                      setOpen(false);
                    }}
                  >
                    <Check
                      className={cn(
                        "mr-2 size-4",
                        value === account.id ? "opacity-100" : "opacity-0"
                      )}
                    />
                    <span className="flex-1 truncate">
                      {account.name} ({account.currency})
                    </span>
                    {balance != null && (
                      <span className="text-muted-foreground ml-2 whitespace-nowrap text-xs tabular-nums">
                        {formatAmount(balance)}
                      </span>
                    )}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
