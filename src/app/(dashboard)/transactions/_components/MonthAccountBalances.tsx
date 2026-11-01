"use client";

import { memo, useState, type ReactNode } from "react";
import { Section } from "@/components/section";
import { Checkbox } from "@/components/ui/checkbox";
import { amountTone, formatAmount } from "@/lib/format";
import type { AccountBalance } from "@/lib/finance/period-summary";

/** Opening and closing balance of each account in the selected month. */
export const MonthAccountBalances = memo(function MonthAccountBalances({
  accountMonthlyBalances,
}: {
  accountMonthlyBalances: AccountBalance[];
}) {
  const [hideZero, setHideZero] = useState(true);

  // "En cero" = the account currently holds nothing: its closing (final)
  // balance rounds to 0,00. The opening balance is irrelevant (an account
  // that started with money and ended at 0 is empty).
  const isZeroAccount = (account: (typeof accountMonthlyBalances)[number]) =>
    Math.round(account.closing * 100) === 0;

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
          {visibleAccounts.map((account) => (
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
              </div>
          ))}
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
