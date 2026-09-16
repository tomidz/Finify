import { parseNumberInput } from "@/lib/utils";

export type AccountBalanceFormValues = {
  initial_amount: string;
  exchange_rate: string;
  base_amount: string;
};

export type StoredInitialBalance = {
  opening_amount: number;
  opening_base_amount: number;
};

export type AccountBalanceFields = {
  initial_amount?: number;
  exchange_rate?: number;
  base_amount?: number;
};

function balanceFields(values: AccountBalanceFormValues): Required<AccountBalanceFields> {
  return {
    initial_amount: Math.abs(parseNumberInput(values.initial_amount)),
    exchange_rate: parseNumberInput(values.exchange_rate),
    base_amount: Math.abs(parseNumberInput(values.base_amount)),
  };
}

/**
 * The balance part of an account create or update. An edit only carries it
 * when the user changed the balance fields and the result differs from what is
 * stored: the server rewrites every opening from it, so an untouched or
 * not-yet-loaded field must never reach it as 0.
 */
export function accountBalancePayload(
  input:
    | { mode: "create"; values: AccountBalanceFormValues }
    | {
        mode: "edit";
        values: AccountBalanceFormValues;
        stored: StoredInitialBalance | null;
        edited: boolean;
      },
): AccountBalanceFields {
  const fields = balanceFields(input.values);
  if (input.mode === "create") return fields;
  if (!input.edited) return {};
  if (
    input.stored &&
    fields.initial_amount === input.stored.opening_amount &&
    fields.base_amount === input.stored.opening_base_amount
  ) {
    return {};
  }
  return fields;
}
