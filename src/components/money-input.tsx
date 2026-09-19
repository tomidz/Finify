"use client";

import * as React from "react";

import { moneyInputCaret, sanitizeMoneyInput } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from "@/components/ui/input-group";

export type MoneyInputProps = Omit<
  React.ComponentProps<"input">,
  "value" | "defaultValue" | "onChange" | "type" | "inputMode"
> & {
  /** The typed text ("1.234,5"), "" when empty. Read it with `parseMoney`; prefill with `toMoneyInput`. */
  value: string;
  /** Gets the sanitized text on every edit. */
  onValueChange?: (next: string) => void;
  /** Same as `onValueChange`, so react-hook-form's `{...field}` spreads in. */
  onChange?: (next: string) => void;
  /** Symbol or code before the amount ("US$", "ARS"). */
  currency?: string;
  /** Max decimal places: the currency's `decimals`. Default 2. */
  decimals?: number;
  /** Accept a leading minus. Default false. */
  allowNegative?: boolean;
  /** Classes for the input itself; `className` sizes the whole field. */
  inputClassName?: string;
};

/** An es-AR amount field: regroups thousands as you type, caps decimals, never turns "" into 0. */
export function MoneyInput({
  value,
  onValueChange,
  onChange,
  currency,
  decimals = 2,
  allowNegative = false,
  className,
  inputClassName,
  placeholder,
  ...props
}: MoneyInputProps) {
  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const raw = input.value;
    // A prefilled value can carry more decimals than are typed (a stored
    // balance with 8): editing it keeps them instead of cutting them off.
    const comma = value.indexOf(",");
    const kept = comma === -1 ? 0 : value.length - comma - 1;
    const options = { decimals: Math.max(decimals, kept), allowNegative };
    const next = sanitizeMoneyInput(raw, options);
    const caret = moneyInputCaret(raw, input.selectionStart ?? raw.length, options);
    onValueChange?.(next);
    onChange?.(next);
    // React writes `next` (or restores the old text when nothing changed)
    // before microtasks run: put the caret back after that.
    queueMicrotask(() => {
      if (input.value === next && input.ownerDocument.activeElement === input) {
        input.setSelectionRange(caret, caret);
      }
    });
  };

  return (
    <InputGroup className={className}>
      {!currency ? null : (
        <InputGroupAddon>
          <InputGroupText>{currency}</InputGroupText>
        </InputGroupAddon>
      )}
      <InputGroupInput
        type="text"
        inputMode="decimal"
        autoComplete="off"
        placeholder={placeholder ?? (decimals > 0 ? "0,00" : "0")}
        value={value}
        onChange={handleChange}
        className={cn("tabular-nums", inputClassName)}
        {...props}
      />
    </InputGroup>
  );
}
