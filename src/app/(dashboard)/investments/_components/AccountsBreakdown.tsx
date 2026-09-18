"use client";

import React from "react";
import { NumericCell } from "@/components/numeric-cell";
import { Section } from "@/components/section";
import { TruncatedText } from "@/components/truncated-text";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ACCOUNT_TYPE_LABELS } from "@/types/accounts";

type InvestmentAccountBreakdownRow = {
  id: string;
  name: string;
  account_type: string;
  balance_base: number;
  investment_value_base: number | null;
};

export const AccountsBreakdown = React.memo(function AccountsBreakdown({
  accounts,
  valuationByAccount,
  currencySymbol,
  pricesFailed,
}: {
  accounts: InvestmentAccountBreakdownRow[];
  /** Market value and cost per account, in the base currency. */
  valuationByAccount: Record<string, { current: number; cost: number } | null> | undefined;
  currencySymbol: string;
  /** No prices at all: an account with holdings has no known market value. */
  pricesFailed: boolean;
}) {
  if (accounts.length === 0) return null;

  const inBase = (value: number | null) =>
    value === null ? (
      <span className="text-muted-foreground block text-right text-xs whitespace-nowrap">sin cotización</span>
    ) : (
      <NumericCell value={value} currency={currencySymbol} />
    );

  return (
    <Section title="Por cuenta">
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Cuenta</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead className="text-right">Efectivo</TableHead>
              <TableHead className="text-right">Costo</TableHead>
              <TableHead className="text-right">Valor actual</TableHead>
              <TableHead className="text-right">Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {accounts.map((account) => {
              const cash = account.balance_base;
              const valuation = valuationByAccount?.[account.id];
              // Until prices arrive the holdings count at cost; null when a
              // lot's currency has no rate.
              const cost = valuation?.cost ?? account.investment_value_base;
              const current = valuation?.current ?? cost;
              const valueUnknown = pricesFailed && cost !== 0;
              const label =
                ACCOUNT_TYPE_LABELS[account.account_type as keyof typeof ACCOUNT_TYPE_LABELS] ??
                account.account_type;
              return (
                <TableRow key={account.id}>
                  <TableCell className="font-medium">
                    <TruncatedText className="max-w-56">{account.name}</TruncatedText>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs">{label}</TableCell>
                  <TableCell>
                    <NumericCell value={cash} currency={currencySymbol} />
                  </TableCell>
                  <TableCell className="text-muted-foreground">{inBase(cost)}</TableCell>
                  <TableCell>{valueUnknown ? <NumericCell value={null} /> : inBase(current)}</TableCell>
                  <TableCell className="font-medium">
                    {valueUnknown ? (
                      <NumericCell value={null} />
                    ) : (
                      inBase(current !== null ? cash + current : null)
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </Section>
  );
});
