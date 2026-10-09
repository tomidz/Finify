"use client";

import * as React from "react";

import { moneyInputCaret, normalizePastedAmount, sanitizeMoneyInput } from "@/lib/format";
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
  onKeyDown,
  onPaste,
  ...props
}: MoneyInputProps) {
  const apply = (input: HTMLInputElement, raw: string, rawCaret: number) => {
    // A prefilled value can carry more decimals than are typed (a stored
    // balance with 8): editing it keeps them instead of cutting them off.
    const comma = value.indexOf(",");
    const kept = comma === -1 ? 0 : value.length - comma - 1;
    const options = { decimals: Math.max(decimals, kept), allowNegative };
    const next = sanitizeMoneyInput(raw, options);
    const caret = moneyInputCaret(raw, rawCaret, options);
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

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    apply(input, input.value, input.selectionStart ?? input.value.length);
  };

  const insert = (input: HTMLInputElement, text: string) => {
    const start = input.selectionStart ?? input.value.length;
    const end = input.selectionEnd ?? start;
    const raw = input.value.slice(0, start) + text + input.value.slice(end);
    apply(input, raw, start + text.length);
  };

  // Thousands are grouped as you type, so a typed "." is never needed for
  // them: it is the decimal mark of a numeric keypad or an en-US habit.
  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    onKeyDown?.(event);
    if (event.defaultPrevented || event.key !== "." || event.ctrlKey || event.metaKey || event.altKey) return;
    const input = event.currentTarget;
    const start = input.selectionStart ?? input.value.length;
    const end = input.selectionEnd ?? start;
    const remaining = input.value.slice(0, start) + input.value.slice(end);
    if (decimals <= 0 || remaining.includes(",")) return;
    event.preventDefault();
    insert(input, ",");
  };

  const handlePaste = (event: React.ClipboardEvent<HTMLInputElement>) => {
    onPaste?.(event);
    if (event.defaultPrevented) return;
    const text = event.clipboardData.getData("text");
    if (!text) return;
    event.preventDefault();
    insert(event.currentTarget, normalizePastedAmount(text));
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
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        className={cn("tabular-nums", inputClassName)}
        {...props}
      />
    </InputGroup>
  );
}
