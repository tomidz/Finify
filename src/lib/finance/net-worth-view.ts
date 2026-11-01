import { ACCOUNT_TYPE_LABELS, type AccountType } from "@/types/accounts";
import type {
  AccountNetWorthSummary,
  LiabilitiesSummary,
  NetWorthEvolutionPoint,
} from "@/types/net-worth";

/*
 * The net worth screen: account balances and debts, at the rate of each
 * month's close. The last point of the chart is always the net worth shown.
 */

type AccountRow = AccountNetWorthSummary["accounts"][number];

export type NetWorthAccount = AccountRow & {
  /** The balance in the base currency. */
  total: number;
};

export interface NetWorthAccountGroup {
  type: string;
  label: string;
  accounts: NetWorthAccount[];
  total: number;
}

export interface NetWorthView {
  accounts: NetWorthAccount[];
  groups: NetWorthAccountGroup[];
  totalAssets: number;
  totalLiabilities: number;
  netWorth: number;
  evolution: NetWorthEvolutionPoint[];
  /** A debt has no rate to the base currency and is left out. */
  fxMissing: boolean;
  /** A balance has no rate to the base currency and counts at its stored base amounts. */
  cashAtBookValue: boolean;
  /** The oldest rate used, only when it is older than the close date. */
  fxRateDate: string | null;
  /** What valuing the balances at the close rate adds to their stored base amounts. */
  fxRevaluation: number;
}

const sum = <T>(items: readonly T[], value: (item: T) => number) =>
  items.reduce((total, item) => total + value(item), 0);

export function buildNetWorthView(input: {
  accounts: AccountNetWorthSummary;
  liabilities: LiabilitiesSummary;
  evolution: readonly NetWorthEvolutionPoint[];
}): NetWorthView {
  const { liabilities } = input;
  const closeDate = input.accounts.close_date ?? liabilities.close_date;

  const accounts = input.accounts.accounts.map(
    (account): NetWorthAccount => ({ ...account, total: account.balance_base }),
  );
  const totalAssets = sum(accounts, (account) => account.total);
  const totalLiabilities = liabilities.total;
  const netWorth = totalAssets - totalLiabilities;

  const cardsFxMissing = liabilities.items.some((item) => item.amount_base === null);
  const cashAtBookValue = accounts.some((account) => account.balance_fx_missing);
  const evolution = [...input.evolution];

  const groupsByType = new Map<string, NetWorthAccountGroup>();
  for (const account of accounts) {
    const type = account.account_type;
    const group = groupsByType.get(type) ?? {
      type,
      label: ACCOUNT_TYPE_LABELS[type as AccountType] ?? type,
      accounts: [],
      total: 0,
    };
    group.accounts.push(account);
    group.total += account.total;
    groupsByType.set(type, group);
  }

  const oldestRateDate =
    [
      ...accounts.map((account) => account.balance_fx_rate_date),
      ...liabilities.items.map((item) => item.fx_rate_date),
    ]
      .filter((date): date is string => date != null)
      .sort()[0] ?? null;

  return {
    accounts,
    groups: [...groupsByType.values()],
    totalAssets,
    totalLiabilities,
    netWorth,
    evolution,
    // Any month of the chart, not only the header's.
    fxMissing: cardsFxMissing || evolution.some((point) => point.fxMissing),
    cashAtBookValue: cashAtBookValue || evolution.some((point) => point.cashFxMissing),
    fxRateDate:
      oldestRateDate != null && closeDate != null && oldestRateDate < closeDate ? oldestRateDate : null,
    fxRevaluation: sum(accounts, (account) =>
      account.balance_fx_missing ? 0 : account.balance_base - account.balance_book_base,
    ),
  };
}
