"use client";

import { memo, useState, type ReactNode } from "react";
import { Section } from "@/components/section";
import { Checkbox } from "@/components/ui/checkbox";
import { amountTone, formatAmount } from "@/lib/format";
import type { AccountBalance } from "@/lib/finance/period-summary";

/** Opening and closing balance of each account in the selected month, plus its investments. */
export const MonthAccountBalances = memo(function MonthAccountBalances({
  accountMonthlyBalances,
  investmentByAccount,
  currentInvestmentByAccount,
  baseCurrencySymbol,
}: {
  accountMonthlyBalances: AccountBalance[];
  investmentByAccount: Map<string, number>;
  currentInvestmentByAccount:
    | Record<string, { current: number; cost: number }>
    | undefined;
  baseCurrencySymbol: string;
}) {
  const [hideZero, setHideZero] = useState(true);

  // "En cero" = the account currently holds nothing: its closing (final)
  // balance rounds to 0,00 and it has no investments. The opening balance is
  // irrelevant (an account that started with money and ended at 0 is empty).
  const roundsToZero = (n: number) => Math.round(n * 100) === 0;
  const isZeroAccount = (
    account: (typeof accountMonthlyBalances)[number],
  ) => {
    if (!roundsToZero(account.closing)) return false;
    const live = currentInvestmentByAccount?.[account.accountId];
    if (live && (!roundsToZero(live.current) || !roundsToZero(live.cost)))
      return false;
    if (!roundsToZero(investmentByAccount.get(account.accountId) ?? 0))
      return false;
    return true;
  };

  const visibleAccounts = hideZero
    ? accountMonthlyBalances.filter((account) => !isZeroAccount(account))
    : accountMonthlyBalances;

  return (
    <Section
      title="Saldos por cuenta"
      actions={
        <label className="text-muted-foreground flex cursor-pointer items-center gap-2 text-xs whitespace-nowrap">
          <Checkbox
            checked={hideZero}
            onCheckedChange={(checked) => setHideZero(checked === true)}
          />
          Ocultar en cero
        </label>
      }
    >
      {accountMonthlyBalances.length === 0 ? (
        <p className="text-muted-foreground text-xs">Sin saldos iniciales este mes.</p>
      ) : visibleAccounts.length === 0 ? (
        <p className="text-muted-foreground text-xs">Todas las cuentas están en cero.</p>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {visibleAccounts.map((account) => {
            const live = currentInvestmentByAccount?.[account.accountId];
            const hasLive = live != null && live.cost > 0;
            const invTotal = investmentByAccount.get(account.accountId) ?? 0;
            const gain = hasLive ? live.current - live.cost : 0;
            const gainPct = hasLive ? (gain / live.cost) * 100 : 0;
            return (
              <div
                key={account.accountId}
                className="flex flex-col gap-1 rounded-md border px-3 py-2 text-xs"
              >
                <p className="truncate font-medium">
                  {account.name}{" "}
                  <span className="text-muted-foreground font-normal">{account.currencyCode}</span>
                </p>
                <BalanceRow label="Inicio">
                  <span className={amountTone(account.opening)}>
                    {account.symbol} {formatAmount(account.opening)}
                  </span>
                </BalanceRow>
                <BalanceRow label="Cierre">
                  <span className={amountTone(account.closing)}>
                    {account.symbol} {formatAmount(account.closing)}
                  </span>
                </BalanceRow>
                {hasLive ? (
                  <>
                    <BalanceRow label="Invertido">
                      {baseCurrencySymbol} {formatAmount(live.cost)}
                    </BalanceRow>
                    <BalanceRow label="Valor actual">
                      <span className={amountTone(gain)}>
                        {baseCurrencySymbol} {formatAmount(live.current)}{" "}
                        <span className="text-[11px]">
                          {gain >= 0 ? "▲" : "▼"} {formatAmount(Math.abs(gainPct))}%
                        </span>
                      </span>
                    </BalanceRow>
                  </>
                ) : (
                  invTotal > 0 && (
                    <BalanceRow label="Inversiones">
                      {account.symbol} {formatAmount(invTotal)}
                    </BalanceRow>
                  )
                )}
              </div>
            );
          })}
        </div>
      )}
    </Section>
  );
});

function BalanceRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium whitespace-nowrap tabular-nums">{children}</span>
    </div>
  );
}
