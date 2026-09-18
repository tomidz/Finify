import type { BudgetCategoryType } from "@/types/budget";
import type { OpeningBalance } from "@/types/months";
import type { TransactionAmountWithRelations, TransactionWithRelations } from "@/types/transactions";

/*
 * The figures of a period (a month or a range of months) in the base currency,
 * computed once for every screen that shows them. It follows the FX policy:
 * movements at the rate of their date, balances at the rate of the period's
 * start and close. Everything that moves the closing balance lands in exactly
 * one line, so opening + income − expenses + other movements = closing.
 */

export interface CategoryDetail {
  categoryId: string;
  categoryName: string;
  categoryType: BudgetCategoryType;
  amount: number;
}

export interface AccountBalance {
  accountId: string;
  name: string;
  currencyCode: string;
  symbol: string;
  opening: number;
  closing: number;
}

/** Movements outside income and expenses, and the revaluation of balances. */
export interface OtherMovements {
  /** Cash into (negative) or out of (positive) investments. */
  investments: number;
  corrections: number;
  /** Fees charged on transfers (negative). */
  transferFees: number;
  /** What a transfer between currencies gains or loses between its two legs. */
  transferFx: number;
  /** Balances held in another currency, from the opening rate to the closing rate. */
  revaluation: number;
  total: number;
}

export interface PeriodSummary {
  openingBase: number;
  income: number;
  essentialExpenses: number;
  discretionaryExpenses: number;
  debtPayments: number;
  savings: number;
  investments: number;
  /** Income and expense movements without a category. */
  uncategorizedExpenses: number;
  totalExpenses: number;
  /** Income minus expenses, as the budget counts them. */
  netMonth: number;
  other: OtherMovements;
  closingBase: number;
  /**
   * Whether the lines add up to the closing balance. A movement with legs no
   * line counts (an income or expense with more than one leg) breaks it.
   */
  ties: boolean;
  /** The closing balance minus the sum of the lines when they don't tie. */
  unexplained: number;
  categoryBreakdown: CategoryDetail[];
  /** Movements valued at a rate quoted before their date (the provider had none). */
  olderRates: number;
  /** Accounts with a balance in another currency and no rate at the start or close. */
  fxMissing: number;
  closeDate: string;
  /** The oldest closing rate, when it was quoted before the close date. */
  closingRateDate: string | null;
}

/** Rates to the base currency for the balances at each end of the period. */
export interface BalanceRates {
  /** The day before the period starts. */
  openDate: string;
  /** The last day of the period, or today if earlier. */
  closeDate: string;
  opening: Record<string, number | null>;
  closing: Record<string, { rate: number; rateDate: string } | null>;
}

export function getPrimaryLine(tx: TransactionWithRelations) {
  if (tx.amounts.length === 0) return null;
  if (tx.transaction_type === "transfer") {
    return tx.amounts.find((line) => line.amount < 0) ?? tx.amounts[0];
  }
  return tx.amounts[0];
}

/** A leg in the base currency at the rate of its date; the stored one without a current rate. */
export function legBase(line: TransactionAmountWithRelations): number {
  return line.current_base_amount ?? line.base_amount;
}

/**
 * Where a movement counts in the budget, like budget_summary_vs_actual: any
 * movement but a transfer counts in its category, and an income or expense
 * without one as uncategorized; its primary leg signed by the category's
 * purpose (positive is income received, or spent). Null for transfers and for
 * investments and corrections without a category.
 */
export function categoryFlow(tx: TransactionWithRelations): {
  key: string;
  income: boolean;
  categoryType: BudgetCategoryType | null;
  amount: number;
} | null {
  if (tx.transaction_type === "transfer") return null;
  const categorized = tx.category_id != null && tx.category_type != null;
  if (!categorized && tx.transaction_type !== "income" && tx.transaction_type !== "expense") return null;
  const primary = getPrimaryLine(tx);
  const base = primary ? legBase(primary) : 0;
  const income = tx.category_type === "income" || (!tx.category_type && tx.transaction_type === "income");
  return {
    key: tx.category_id ?? (income ? UNCATEGORIZED_INCOME : UNCATEGORIZED_EXPENSES),
    income,
    categoryType: tx.category_type,
    amount: income ? base : -base,
  };
}

export const UNCATEGORIZED_INCOME = "uncategorized:income";
export const UNCATEGORIZED_EXPENSES = "uncategorized:expenses";

const EXPENSE_TYPES = [
  "essential_expenses",
  "discretionary_expenses",
  "debt_payments",
  "savings",
  "investments",
] as const;

export function computePeriodSummary(input: {
  transactions: readonly TransactionWithRelations[];
  openingBalances: readonly OpeningBalance[];
  baseCurrency: string;
  rates: BalanceRates;
  today: string;
}): { summary: PeriodSummary; accountBalances: AccountBalance[] } {
  const { baseCurrency, rates } = input;
  const expenses: Record<(typeof EXPENSE_TYPES)[number], number> = {
    essential_expenses: 0,
    discretionary_expenses: 0,
    debt_payments: 0,
    savings: 0,
    investments: 0,
  };
  let income = 0;
  let uncategorizedExpenses = 0;
  const other = { investments: 0, corrections: 0, transferFees: 0, transferFx: 0 };
  let olderRates = 0;
  const categories = new Map<string, CategoryDetail>();

  type AccountState = AccountBalance & { openingBase: number; flowsBase: number };
  const accounts = new Map<string, AccountState>();
  for (const ob of input.openingBalances) {
    accounts.set(ob.account_id, {
      accountId: ob.account_id,
      name: ob.account_name,
      currencyCode: ob.account_currency,
      symbol: ob.account_currency_symbol,
      opening: ob.opening_amount,
      closing: ob.opening_amount,
      openingBase: 0,
      flowsBase: 0,
    });
  }

  // Each movement's legs, all counted by exactly one line below.
  let countedBase = 0;
  let movementsBase = 0;
  for (const tx of input.transactions) {
    const txBase = tx.amounts.reduce((sum, line) => sum + legBase(line), 0);
    movementsBase += txBase;

    const primary = getPrimaryLine(tx);
    if (primary?.current_rate_date) {
      // A future movement takes today's rate by design.
      const expected = tx.date < input.today ? tx.date : input.today;
      if (primary.current_rate_date < expected) olderRates += 1;
    }

    for (const line of tx.amounts) {
      const account = accounts.get(line.account_id);
      if (account) {
        account.closing += line.amount;
        account.flowsBase += legBase(line);
      } else {
        accounts.set(line.account_id, {
          accountId: line.account_id,
          name: line.account_name,
          currencyCode: line.original_currency,
          symbol: line.account_currency_symbol,
          opening: 0,
          closing: line.amount,
          openingBase: 0,
          flowsBase: legBase(line),
        });
      }
    }

    // Income and expenses, and anything else with a category: the primary
    // leg, so a refund lowers its category's spending (see categoryFlow).
    const flow = categoryFlow(tx);
    if (flow) {
      countedBase += flow.income ? flow.amount : -flow.amount;
      if (flow.income) income += flow.amount;
      else if (flow.categoryType && flow.categoryType !== "income") expenses[flow.categoryType] += flow.amount;
      else uncategorizedExpenses += flow.amount;
      if (tx.category_id && tx.category_name && tx.category_type) {
        const existing = categories.get(tx.category_id);
        if (existing) existing.amount += flow.amount;
        else
          categories.set(tx.category_id, {
            categoryId: tx.category_id,
            categoryName: tx.category_name,
            categoryType: tx.category_type,
            amount: flow.amount,
          });
      }
      continue;
    }

    switch (tx.transaction_type) {
      case "transfer": {
        // The fee leaves with the source leg, at its rate.
        const source = tx.amounts.find((line) => line.amount < 0);
        const feeBase =
          source && source.amount !== 0 ? (tx.fee * legBase(source)) / source.amount : 0;
        other.transferFees -= feeBase;
        other.transferFx += txBase + feeBase;
        countedBase += txBase;
        break;
      }
      case "investment":
        other.investments += txBase;
        countedBase += txBase;
        break;
      case "correction":
        other.corrections += txBase;
        countedBase += txBase;
        break;
    }
  }

  // Balances at both ends of the period. Without a rate, the opening keeps its
  // stored base and the closing adds the movements to it, unrevalued.
  const storedOpeningBase = new Map(
    input.openingBalances.map((ob) => [ob.account_id, ob.opening_base_amount]),
  );
  let openingBase = 0;
  let closingBase = 0;
  let fxMissing = 0;
  let closingRateDate: string | null = null;
  for (const account of accounts.values()) {
    const foreign = account.currencyCode !== baseCurrency;
    const openingRate = foreign ? rates.opening[account.currencyCode] : 1;
    account.openingBase =
      account.opening === 0
        ? 0
        : openingRate != null
          ? account.opening * openingRate
          : (storedOpeningBase.get(account.accountId) ?? 0);
    const closing = foreign ? rates.closing[account.currencyCode] : { rate: 1, rateDate: rates.closeDate };
    const closingValue =
      account.closing === 0
        ? 0
        : closing != null
          ? account.closing * closing.rate
          : account.openingBase + account.flowsBase;
    if (foreign && ((account.opening !== 0 && openingRate == null) || (account.closing !== 0 && closing == null))) {
      fxMissing += 1;
    }
    if (foreign && account.closing !== 0 && closing != null && closing.rateDate < rates.closeDate) {
      if (closingRateDate == null || closing.rateDate < closingRateDate) closingRateDate = closing.rateDate;
    }
    openingBase += account.openingBase;
    closingBase += closingValue;
  }
  const revaluation = closingBase - openingBase - movementsBase;

  const totalExpenses =
    EXPENSE_TYPES.reduce((sum, type) => sum + expenses[type], 0) + uncategorizedExpenses;
  const netMonth = income - totalExpenses;
  const otherTotal =
    other.investments + other.corrections + other.transferFees + other.transferFx + revaluation;
  const unexplained = movementsBase - countedBase;

  return {
    summary: {
      openingBase,
      income,
      essentialExpenses: expenses.essential_expenses,
      discretionaryExpenses: expenses.discretionary_expenses,
      debtPayments: expenses.debt_payments,
      savings: expenses.savings,
      investments: expenses.investments,
      uncategorizedExpenses,
      totalExpenses,
      netMonth,
      other: { ...other, revaluation, total: otherTotal },
      closingBase,
      ties: Math.abs(unexplained) < 0.01,
      unexplained,
      categoryBreakdown: [...categories.values()].sort((a, b) => b.amount - a.amount),
      olderRates,
      fxMissing,
      closeDate: rates.closeDate,
      closingRateDate,
    },
    accountBalances: [...accounts.values()]
      .map((account) => ({
        accountId: account.accountId,
        name: account.name,
        currencyCode: account.currencyCode,
        symbol: account.symbol,
        opening: account.opening,
        closing: account.closing,
      }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  };
}
