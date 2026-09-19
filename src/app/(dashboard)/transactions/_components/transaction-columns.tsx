"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { format, parseISO } from "date-fns";
import { Pencil, Trash2 } from "lucide-react";
import { NumericCell } from "@/components/numeric-cell";
import { RowActions } from "@/components/row-actions";
import { TruncatedText } from "@/components/truncated-text";
import { Badge } from "@/components/ui/badge";
import { getPrimaryLine, legBase } from "@/lib/finance/period-summary";
import { formatAmount } from "@/lib/format";
import {
  TRANSACTION_TYPE_LABELS,
  type TransactionWithRelations,
} from "@/types/transactions";

export type TableTransaction = TransactionWithRelations & {
  primaryLine: ReturnType<typeof getPrimaryLine>;
};

export function toTableTransaction(transaction: TransactionWithRelations): TableTransaction {
  return { ...transaction, primaryLine: getPrimaryLine(transaction) };
}

const alignRight = (label: string) => <span className="block text-right">{label}</span>;

/** The feed's columns. Amounts are the primary leg's, signed as it moved its account. */
export function transactionColumns({
  baseCurrencySymbol,
  decimalsOf,
  deletingId,
  onEdit,
  onDelete,
}: {
  baseCurrencySymbol: string;
  /** Decimal places of a currency code. */
  decimalsOf: (currencyCode: string) => number;
  /** The transaction being deleted: it cannot be deleted twice. */
  deletingId?: string;
  onEdit: (transaction: TransactionWithRelations) => void;
  onDelete: (transaction: TransactionWithRelations) => void;
}): ColumnDef<TableTransaction>[] {
  return [
    {
      accessorKey: "date",
      header: "Fecha",
      cell: ({ row }) => (
        <span className="tabular-nums">{format(parseISO(row.original.date), "dd/MM/yyyy")}</span>
      ),
    },
    {
      accessorKey: "description",
      header: "Descripción",
      cell: ({ row }) => {
        const tx = row.original;
        const fee = Number(tx.fee ?? 0);
        // A transfer's primary leg is its source, which pays the fee.
        const source = tx.primaryLine;
        const feeLabel =
          tx.transaction_type === "transfer" && fee > 0
            ? `Comisión ${source?.account_currency_symbol ?? ""} ${formatAmount(
                fee,
                source ? decimalsOf(source.original_currency) : 2,
              )}`
            : null;
        const secondary = [feeLabel, tx.notes].filter(Boolean).join(" · ");
        return (
          <div className="flex max-w-72 min-w-0 flex-col">
            <TruncatedText>{tx.description}</TruncatedText>
            {!secondary ? null : (
              <TruncatedText className="text-muted-foreground text-[11px]">{secondary}</TruncatedText>
            )}
          </div>
        );
      },
    },
    {
      accessorKey: "transaction_type",
      header: "Tipo",
      cell: ({ row }) => (
        <Badge variant="secondary" className="font-normal">
          {TRANSACTION_TYPE_LABELS[row.original.transaction_type]}
        </Badge>
      ),
    },
    {
      id: "account_name",
      header: "Cuenta",
      cell: ({ row }) => (
        <TruncatedText className="max-w-40">{row.original.primaryLine?.account_name || "—"}</TruncatedText>
      ),
    },
    {
      accessorKey: "category_name",
      header: "Categoría",
      cell: ({ row }) => (
        <TruncatedText className="max-w-40">{row.original.category_name ?? "—"}</TruncatedText>
      ),
    },
    {
      id: "amount",
      header: () => alignRight("Monto"),
      cell: ({ row }) => {
        const tx = row.original;
        const line = tx.primaryLine;
        return (
          <NumericCell
            value={line?.amount}
            currency={line?.account_currency_symbol}
            decimals={line ? decimalsOf(line.original_currency) : undefined}
            // A transfer moves money between own accounts: neither in nor out.
            tone={tx.transaction_type !== "transfer"}
            className="font-medium"
          />
        );
      },
    },
    {
      id: "base_amount",
      header: () => alignRight("Monto base"),
      cell: ({ row }) => {
        const line = row.original.primaryLine;
        return (
          <NumericCell
            value={line ? legBase(line) : null}
            currency={baseCurrencySymbol || undefined}
            className="text-muted-foreground"
          />
        );
      },
    },
    {
      id: "actions",
      header: () => <span className="sr-only">Acciones</span>,
      cell: ({ row }) => (
        <div className="flex justify-end">
          <RowActions
            actions={[
              {
                label: "Editar",
                icon: Pencil,
                // Created by a purchase or sale: edited from Inversiones.
                hidden: row.original.transaction_type === "investment",
                onSelect: () => onEdit(row.original),
              },
              {
                label: "Eliminar…",
                icon: Trash2,
                destructive: true,
                // The server refuses it: it goes with its purchase or sale.
                hidden: row.original.transaction_type === "investment",
                disabled: row.original.id === deletingId,
                onSelect: () => onDelete(row.original),
              },
            ]}
          />
        </div>
      ),
    },
  ];
}
