"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { formatAmount, amountTone, MONTH_NAMES } from "@/lib/format";
import type { AccountBalance } from "@/hooks/useMonthSummary";
import type { Month } from "@/types/months";
import { fetchCryptoPrices } from "@/lib/coingecko";

interface AccountBalancesProps {
  balances: AccountBalance[];
  selectedMonth: Month | null;
  endMonth?: Month | null;
  baseCurrencyCode: string | null;
  baseCurrencySymbol: string;
}

export function AccountBalances({
  balances,
  selectedMonth,
  endMonth,
  baseCurrencyCode,
  baseCurrencySymbol,
}: AccountBalancesProps) {
  const cryptoCodes = useMemo(
    () =>
      Array.from(
        new Set(
          balances
            .map((b) => b.currencyCode)
            .filter((code) => ["BTC", "ETH", "SOL", "ADA"].includes(code)),
        ),
      ),
    [balances],
  );

  const { data: cryptoPrices } = useQuery({
    queryKey: ["crypto-prices", baseCurrencyCode, cryptoCodes],
    enabled: !!baseCurrencyCode && cryptoCodes.length > 0,
    queryFn: async () => {
      if (!baseCurrencyCode || cryptoCodes.length === 0) return {};
      return fetchCryptoPrices(cryptoCodes, baseCurrencyCode);
    },
    staleTime: 60_000,
  });

  if (!selectedMonth) return null;

  const isRange =
    endMonth &&
    (selectedMonth.year !== endMonth.year || selectedMonth.month !== endMonth.month);
  const title = isRange
    ? `Saldos por cuenta - ${MONTH_NAMES[selectedMonth.month - 1]} ${selectedMonth.year} a ${MONTH_NAMES[endMonth.month - 1]} ${endMonth.year}`
    : `Saldos por cuenta - ${MONTH_NAMES[selectedMonth.month - 1]} ${selectedMonth.year}`;
  const subtitle = isRange
    ? "Inicio y cierre del período seleccionado."
    : "Inicio y cierre del mes seleccionado.";
  const labelInicio = isRange ? "Inicio del período" : "Inicio del mes";
  const labelCierre = isRange ? "Cierre del período" : "Final del mes";

  return (
    <div className="rounded-md border p-3 sm:p-4">
      <p className="text-base font-semibold">{title}</p>
      <p className="text-muted-foreground mb-3 text-xs">{subtitle}</p>
      {balances.length > 0 ? (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {balances.map((account) => {
            const price =
              cryptoPrices?.[account.currencyCode as keyof typeof cryptoPrices];
            const currentBaseValue =
              baseCurrencyCode && price != null
                ? account.closing * price
                : null;

            return (
              <div
                key={account.accountId}
                className="bg-muted/20 space-y-2 rounded-md border px-3 py-2.5"
              >
                <p className="text-foreground truncate text-sm font-semibold">
                  {account.name} ({account.currencyCode})
                </p>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-muted-foreground text-xs">
                    {labelInicio}
                  </span>
                  <span
                    className={`whitespace-nowrap text-sm font-semibold ${amountTone(account.opening)}`}
                  >
                    {account.symbol} {formatAmount(account.opening)}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-muted-foreground text-xs">
                    {labelCierre}
                  </span>
                  <span
                    className={`whitespace-nowrap text-sm font-semibold ${amountTone(account.closing)}`}
                  >
                    {account.symbol} {formatAmount(account.closing)}
                  </span>
                </div>
                {currentBaseValue != null && (
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-muted-foreground text-xs">
                      Valor actual
                    </span>
                    <span className="whitespace-nowrap text-xs font-medium">
                      {baseCurrencySymbol} {formatAmount(currentBaseValue)}
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-muted-foreground text-sm">
          No hay saldos iniciales cargados para este mes.
        </p>
      )}
    </div>
  );
}
