"use client";

import { useEffect, useRef, useState } from "react";

import { MoneyInput } from "@/components/money-input";
import { NumericCell } from "@/components/numeric-cell";
import { Spinner } from "@/components/ui/spinner";
import { toMoneyInput } from "@/lib/format";
import { uiScale } from "@/lib/ui-scale";
import { cn } from "@/lib/utils";
import { planAmountToSave } from "./plan-amount";

interface PlanAmountCellProps {
  value: number;
  decimals: number;
  /** Names the field, e.g. "Plan de Supermercado". */
  label: string;
  /** Saves the new plan; false keeps the field open with what was typed. */
  onSave: (amount: number) => Promise<boolean>;
}

/**
 * A planned amount edited in place: Enter or leaving the field saves, Esc
 * cancels. An empty field changes nothing (it is never saved as 0).
 */
export function PlanAmountCell({ value, decimals, label, onSave }: PlanAmountCellProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // Refs, not state: blur can fire again as the field unmounts or after Esc,
  // with the handlers of the last render.
  const editing = useRef(false);
  const busy = useRef(false);
  const refocus = useRef(false);
  const displayRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (draft !== null || !refocus.current) return;
    refocus.current = false;
    displayRef.current?.focus();
  }, [draft]);

  const start = () => {
    editing.current = true;
    setDraft(toMoneyInput(value, decimals));
  };

  const close = (focusDisplay: boolean) => {
    editing.current = false;
    refocus.current = focusDisplay;
    setDraft(null);
  };

  const commit = async (text: string, focusDisplay: boolean) => {
    if (!editing.current || busy.current) return;
    const amount = planAmountToSave(text, value, decimals);
    if (amount === null) {
      close(focusDisplay);
      return;
    }
    busy.current = true;
    setSaving(true);
    let saved = false;
    try {
      saved = await onSave(amount);
    } finally {
      busy.current = false;
      setSaving(false);
    }
    if (saved) close(focusDisplay);
  };

  if (draft === null) {
    return (
      <button
        ref={displayRef}
        type="button"
        aria-label={`Editar: ${label}`}
        onClick={(event) => {
          event.stopPropagation();
          start();
        }}
        className="hover:bg-muted focus-visible:ring-ring/50 h-7 w-full cursor-text rounded-md px-2 outline-none focus-visible:ring-[3px]"
      >
        <NumericCell value={value} decimals={decimals} className={value === 0 ? "text-muted-foreground" : undefined} />
      </button>
    );
  }

  return (
    <div className="relative" onClick={(event) => event.stopPropagation()}>
      {!saving ? null : <Spinner className="absolute top-1/2 left-2 z-10 size-3 -translate-y-1/2" />}
      <MoneyInput
        autoFocus
        aria-label={label}
        aria-busy={saving}
        readOnly={saving}
        value={draft}
        onValueChange={setDraft}
        decimals={decimals}
        className={cn(uiScale.field, "h-7")}
        inputClassName="px-2 text-right"
        onFocus={(event) => event.currentTarget.select()}
        onBlur={() => void commit(draft, false)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            void commit(draft, true);
          } else if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            if (!busy.current) close(true);
          }
        }}
      />
    </div>
  );
}
