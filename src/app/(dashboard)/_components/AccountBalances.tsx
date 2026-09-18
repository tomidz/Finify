"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { NumericCell } from "@/components/numeric-cell";
import { useCurrencyDecimals } from "@/hooks/useAccounts";
import { Section } from "@/components/section";
import { StateCard } from "@/components/state-card";
import { TruncatedText } from "@/components/truncated-text";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { AccountBalance } from "@/lib/finance/period-summary";
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
  const decimalsOf = useCurrencyDecimals();
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

  const rows = useMemo(
    () =>
      balances.map((account) => {
        const price = cryptoPrices?.[account.currencyCode as keyof typeof cryptoPrices];
        const currentBaseValue =
          baseCurrencyCode && price != null ? account.closing * price : null;
        return { account, currentBaseValue };
      }),
    [balances, cryptoPrices, baseCurrencyCode],
  );
  const showCurrentValue = rows.some((row) => row.currentBaseValue != null);

  if (!selectedMonth) return null;

  const isRange =
    endMonth &&
    (selectedMonth.year !== endMonth.year || selectedMonth.month !== endMonth.month);
  const labelInicio = isRange ? "Inicio del período" : "Inicio del mes";
  const labelCierre = isRange ? "Cierre del período" : "Final del mes";

  return (
    <Section title="Saldos por cuenta">
      {balances.length === 0 ? (
        <StateCard variant="empty" title="Sin saldos cargados" className="min-h-24" />
      ) : (
        <div className="overflow-hidden rounded-lg border">
          <Table className="text-xs">
            <TableHeader>
              <TableRow>
                <TableHead>Cuenta</TableHead>
                <TableHead className="text-right">{labelInicio}</TableHead>
                <TableHead className="text-right">{labelCierre}</TableHead>
                {!showCurrentValue ? null : <TableHead className="text-right">Valor actual</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(({ account, currentBaseValue }) => (
                <TableRow key={account.accountId}>
                  <TableCell>
                    <TruncatedText className="max-w-40 font-medium sm:max-w-72">
                      {account.name} <span className="text-muted-foreground">({account.currencyCode})</span>
                    </TruncatedText>
                  </TableCell>
                  <TableCell>
                    <NumericCell value={account.opening} currency={account.symbol} decimals={decimalsOf(account.currencyCode)} tone />
                  </TableCell>
                  <TableCell>
                    <NumericCell value={account.closing} currency={account.symbol} decimals={decimalsOf(account.currencyCode)} tone />
                  </TableCell>
                  {!showCurrentValue ? null : (
                    <TableCell>
                      {currentBaseValue == null ? null : (
                        <NumericCell value={currentBaseValue} currency={baseCurrencySymbol} />
                      )}
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </Section>
  );
}
