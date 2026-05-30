import { useMemo } from "react";
import type { TransactionWithRelations } from "@/types/transactions";
import type { OpeningBalance } from "@/types/months";

export interface CategoryDetail {
  categoryId: string;
  categoryName: string;
  categoryType: string;
  amount: number;
}

export interface MonthSummary {
  openingBase: number;
  income: number;
  essentialExpenses: number;
  discretionaryExpenses: number;
  debtPayments: number;
  savings: number;
  investments: number;
  totalExpenses: number;
  netMonth: number;
  closingBase: number;
  categoryBreakdown: CategoryDetail[];
}

export interface AccountBalance {
  accountId: string;
  name: string;
  currencyCode: string;
  symbol: string;
  opening: number;
  closing: number;
}

export function getPrimaryLine(tx: TransactionWithRelations) {
  if (tx.amounts.length === 0) return null;
  if (tx.transaction_type === "transfer") {
    return tx.amounts.find((line) => line.amount < 0) ?? tx.amounts[0];
  }
  return tx.amounts[0];
}

export function useMonthSummary(
  transactions: TransactionWithRelations[] | undefined,
  openingBalances: OpeningBalance[] | undefined,
): { monthSummary: MonthSummary; accountMonthlyBalances: AccountBalance[] } {
  const txs = useMemo(() => transactions ?? [], [transactions]);

  const summaryAndBalances = useMemo(() => {
    const byAccount = new Map<string, AccountBalance>();
    let openingBase = 0;
    let income = 0;
    let essentialExpenses = 0;
    let discretionaryExpenses = 0;
    let debtPayments = 0;
    let savings = 0;
    let investments = 0;
    let netMonth = 0;
    const categoryMap = new Map<string, CategoryDetail>();

    for (const ob of openingBalances ?? []) {
      openingBase += ob.current_opening_base_amount ?? ob.opening_base_amount ?? 0;
      byAccount.set(ob.account_id, {
        accountId: ob.account_id,
        name: ob.account_name,
        currencyCode: ob.account_currency,
        symbol: ob.account_currency_symbol,
        opening: ob.opening_amount,
        closing: ob.opening_amount,
      });
    }

    for (const tx of txs) {
      const primaryLine = getPrimaryLine(tx);
      const primaryBase =
        primaryLine?.current_base_amount ?? primaryLine?.base_amount ?? 0;

      if (tx.transaction_type !== "transfer") {
        netMonth += primaryBase;

        if (tx.transaction_type === "income") {
          income += Math.abs(primaryBase);
        }

        const absoluteBase = Math.abs(primaryBase);
        switch (tx.category_type) {
          case "essential_expenses":
            essentialExpenses += absoluteBase;
            break;
          case "discretionary_expenses":
            discretionaryExpenses += absoluteBase;
            break;
          case "debt_payments":
            debtPayments += absoluteBase;
            break;
          case "savings":
            savings += absoluteBase;
            break;
          case "investments":
            investments += absoluteBase;
            break;
          default:
            break;
        }

        // Accumulate per individual category
        if (tx.category_id && tx.category_name && tx.category_type) {
          const existing = categoryMap.get(tx.category_id);
          if (existing) {
            existing.amount += absoluteBase;
          } else {
            categoryMap.set(tx.category_id, {
              categoryId: tx.category_id,
              categoryName: tx.category_name,
              categoryType: tx.category_type,
              amount: absoluteBase,
            });
          }
        }
      }

      for (const line of tx.amounts) {
        const current = byAccount.get(line.account_id);
        if (current) {
          current.closing += line.amount;
        } else {
          byAccount.set(line.account_id, {
            accountId: line.account_id,
            name: line.account_name,
            currencyCode: line.original_currency,
            symbol: line.account_currency_symbol,
            opening: 0,
            closing: line.amount,
          });
        }
      }
    }

    const totalExpenses =
      essentialExpenses +
      discretionaryExpenses +
      debtPayments +
      savings +
      investments;

    return {
      monthSummary: {
        openingBase,
        income,
        essentialExpenses,
        discretionaryExpenses,
        debtPayments,
        savings,
        investments,
        totalExpenses,
        netMonth,
        closingBase: openingBase + netMonth,
        categoryBreakdown: Array.from(categoryMap.values()).sort((a, b) => b.amount - a.amount),
      },
      accountMonthlyBalances: Array.from(byAccount.values()).sort((a, b) =>
        a.name.localeCompare(b.name),
      ),
    };
  }, [openingBalances, txs]);

  return summaryAndBalances;
}
