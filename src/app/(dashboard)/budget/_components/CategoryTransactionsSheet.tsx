"use client";

import { useMemo } from "react";
import Link from "next/link";
import { ArrowUpRight, Receipt } from "lucide-react";

import { DetailSheet } from "@/components/detail-sheet";
import { NumericCell } from "@/components/numeric-cell";
import { PageButton } from "@/components/page-button";
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
import { useCurrencies } from "@/hooks/useAccounts";
import { useTransactions } from "@/hooks/useTransactions";
import { getPrimaryLine } from "@/lib/finance/period-summary";
import { formatDayMonth } from "@/lib/format";
import type { BudgetCategory } from "@/types/budget";

interface CategoryTransactionsSheetProps {
  monthId: string;
  /** "Septiembre 2026". */
  monthName: string;
  /** The category shown; null closes the sheet. */
  category: BudgetCategory | null;
  onClose: () => void;
}

/** A budget category's movements in the selected month. */
export function CategoryTransactionsSheet({ monthId, monthName, category, onClose }: CategoryTransactionsSheetProps) {
  // The page already loads this month's transactions: same query, same cache.
  const { data: transactions, error, refetch } = useTransactions(monthId);
  const { data: currencies } = useCurrencies();

  const rows = useMemo(() => {
    if (!category || !transactions) return [];
    return transactions
      .filter((tx) => tx.category_id === category.id)
      .sort((a, b) => b.date.localeCompare(a.date) || b.created_at.localeCompare(a.created_at))
      .map((tx) => ({ tx, line: getPrimaryLine(tx) }));
  }, [category, transactions]);

  const decimalsOf = (code: string | undefined) => currencies?.find((c) => c.code === code)?.decimals ?? 2;

  const body = (() => {
    if (!transactions) {
      return !error ? (
        <StateCard variant="loading" />
      ) : (
        <StateCard variant="error" error={error} onRetry={() => void refetch()} />
      );
    }
    if (rows.length === 0) return <StateCard variant="empty" icon={Receipt} title="Sin movimientos" />;
    return (
      <div className="rounded-md border">
        <Table className="text-xs">
          <TableHeader>
            <TableRow>
              <TableHead className="w-14">Fecha</TableHead>
              <TableHead>Descripción</TableHead>
              <TableHead>Cuenta</TableHead>
              <TableHead className="text-right">Monto</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map(({ tx, line }) => (
              <TableRow key={tx.id}>
                <TableCell className="text-muted-foreground tabular-nums">{formatDayMonth(tx.date)}</TableCell>
                <TableCell>
                  <TruncatedText className="max-w-48">{tx.description}</TruncatedText>
                </TableCell>
                <TableCell>
                  <TruncatedText className="text-muted-foreground max-w-28">{line?.account_name ?? "—"}</TruncatedText>
                </TableCell>
                <TableCell>
                  <NumericCell
                    value={line?.amount}
                    currency={line?.account_currency_symbol}
                    decimals={decimalsOf(line?.original_currency)}
                    tone
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    );
  })();

  return (
    <DetailSheet
      open={category !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={category?.name ?? ""}
      description={!transactions ? monthName : `${monthName} · ${rows.length} ${rows.length === 1 ? "movimiento" : "movimientos"}`}
      footer={
        !category ? null : (
          <PageButton asChild variant="outline" icon={ArrowUpRight}>
            <Link href={`/transactions?month=${monthId}&category=${category.id}`}>Ver en Transacciones</Link>
          </PageButton>
        )
      }
    >
      {body}
    </DetailSheet>
  );
}
