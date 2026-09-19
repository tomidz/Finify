import { parseMoney } from "@/lib/format";

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

/** The typed fields, leaving out the empty ones: an empty field is never 0. */
function balanceFields(values: AccountBalanceFormValues): AccountBalanceFields {
  const initialAmount = parseMoney(values.initial_amount);
  if (initialAmount == null) return {};
  const exchangeRate = parseMoney(values.exchange_rate);
  const baseAmount = parseMoney(values.base_amount);
  return {
    initial_amount: Math.abs(initialAmount),
    ...(exchangeRate == null ? {} : { exchange_rate: exchangeRate }),
    ...(baseAmount == null ? {} : { base_amount: Math.abs(baseAmount) }),
  };
}

/**
 * The balance part of an account create or update. An empty initial amount
 * sends nothing. An edit only carries it when the user changed the balance
 * fields and the result differs from what is stored: the server rewrites
 * every opening from it, so an untouched or not-yet-loaded field must never
 * reach it as 0.
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
  if (!input.edited || fields.initial_amount === undefined) return {};
  if (
    input.stored &&
    fields.initial_amount === input.stored.opening_amount &&
    fields.base_amount === input.stored.opening_base_amount
  ) {
    return {};
  }
  return fields;
}
