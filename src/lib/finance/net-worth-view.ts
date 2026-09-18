import { ACCOUNT_TYPE_LABELS, type AccountType } from "@/types/accounts";
import type {
  AccountNetWorthSummary,
  LiabilitiesSummary,
  NetWorthEvolutionPoint,
} from "@/types/net-worth";

/*
 * The net worth screen: the ledger figures (balances, positions at cost and
 * debts, at the rate of each month's close) plus today's market value of the
 * positions. Market value only exists for today, so it applies only to a
 * period that closes today, and whatever it adds to the accounts is added to
 * the chart's point for today: the last point is always the net worth shown.
 */

type AccountRow = AccountNetWorthSummary["accounts"][number];

export type NetWorthAccount = AccountRow & {
  /** Cash plus positions in the base currency, leaving out what has no rate. */
  total: number;
};

export interface NetWorthAccountGroup {
  type: string;
  label: string;
  accounts: NetWorthAccount[];
  total: number;
}

/** Today's market value of the positions per account. */
export interface MarketValuation {
  byAccount: Record<string, { current: number }>;
  /** The oldest rate a lot in another currency was valued at. */
  fxRateDate: string | null;
}

export interface NetWorthView {
  /** Positions at market value rather than at cost. */
  marketValued: boolean;
  accounts: NetWorthAccount[];
  groups: NetWorthAccountGroup[];
  totalAssets: number;
  totalLiabilities: number;
  netWorth: number;
  evolution: NetWorthEvolutionPoint[];
  /** A position or a debt has no rate to the base currency and is left out. */
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
  valuation: MarketValuation | null | undefined;
  /** yyyy-MM-dd in the app's timezone. */
  today: string;
}): NetWorthView {
  const { liabilities, today } = input;
  const closeDate = input.accounts.close_date ?? liabilities.close_date;
  const marketValued = input.valuation != null && closeDate === today;
  const marketValue = (accountId: string) =>
    marketValued ? input.valuation?.byAccount[accountId]?.current : undefined;

  const accounts = input.accounts.accounts.map((account): NetWorthAccount => {
    const investmentBase = marketValue(account.id) ?? account.investment_value_base;
    return {
      ...account,
      investment_value_base: investmentBase,
      total: account.balance_base + (investmentBase ?? 0),
    };
  });
  const totalAssets = sum(accounts, (account) => account.total);
  const totalLiabilities = liabilities.total;
  const netWorth = totalAssets - totalLiabilities;

  const cardsFxMissing =
    accounts.some((account) => account.investment_value_base === null) ||
    liabilities.items.some((item) => item.amount_base === null);
  const cashAtBookValue = accounts.some((account) => account.balance_fx_missing);
  const marketDelta = sum(input.accounts.accounts, (account) => {
    const current = marketValue(account.id);
    return current == null ? 0 : current - (account.investment_value_base ?? 0);
  });
  const evolution = input.evolution.map((point) =>
    !marketValued || point.closeDate !== today
      ? point
      : {
          ...point,
          assets: point.assets + marketDelta,
          netWorth: point.netWorth + marketDelta,
          fxMissing: cardsFxMissing,
          cashFxMissing: cashAtBookValue,
        },
  );

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
      marketValued ? (input.valuation?.fxRateDate ?? null) : null,
      ...input.accounts.accounts.flatMap((account) => [
        account.balance_fx_rate_date,
        marketValue(account.id) != null ? null : account.investment_fx_rate_date,
      ]),
      ...liabilities.items.map((item) => item.fx_rate_date),
    ]
      .filter((date): date is string => date != null)
      .sort()[0] ?? null;

  return {
    marketValued,
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
