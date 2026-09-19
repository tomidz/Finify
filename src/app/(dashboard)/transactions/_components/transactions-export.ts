import type { CsvColumn } from "@/lib/csv-export";
import { getPrimaryLine, legBase } from "@/lib/finance/period-summary";
import {
  TRANSACTION_TYPE_LABELS,
  type TransactionWithRelations,
} from "@/types/transactions";

interface OffsetPage<T> {
  items: T[];
  nextOffset: number | null;
}

/** Every item of an offset-paged read, asking page after page until there is no next one. */
export async function fetchAllPages<T>(
  fetchPage: (offset: number) => Promise<OffsetPage<T>>,
): Promise<T[]> {
  const items: T[] = [];
  let offset: number | null = 0;
  while (offset !== null) {
    const page: OffsetPage<T> = await fetchPage(offset);
    items.push(...page.items);
    if (page.nextOffset !== null && page.nextOffset <= offset) {
      throw new Error(`Paging did not advance past offset ${offset}`);
    }
    offset = page.nextOffset;
  }
  return items;
}

/**
 * The export's columns. Amounts are the primary leg's, signed as it moved its
 * account (a transfer's is the source leg), like the table shows them.
 */
export function transactionCsvColumns(
  baseCurrency: string | null,
): CsvColumn<TransactionWithRelations>[] {
  return [
    { header: "Fecha", value: (tx) => tx.date },
    { header: "Descripción", value: (tx) => tx.description },
    { header: "Tipo", value: (tx) => TRANSACTION_TYPE_LABELS[tx.transaction_type] },
    { header: "Categoría", value: (tx) => tx.category_name },
    { header: "Cuenta", value: (tx) => getPrimaryLine(tx)?.account_name },
    { header: "Moneda", value: (tx) => getPrimaryLine(tx)?.original_currency },
    { header: "Monto", value: (tx) => getPrimaryLine(tx)?.amount },
    {
      header: baseCurrency ? `Monto en ${baseCurrency}` : "Monto en moneda base",
      value: (tx) => {
        const line = getPrimaryLine(tx);
        return line ? legBase(line) : null;
      },
    },
    // A transfer's other leg and its fee, so a transfer between currencies
    // can be rebuilt from the file.
    { header: "Cuenta destino", value: (tx) => destinationLine(tx)?.account_name },
    { header: "Moneda destino", value: (tx) => destinationLine(tx)?.original_currency },
    { header: "Monto destino", value: (tx) => destinationLine(tx)?.amount },
    { header: "Comisión", value: (tx) => (tx.fee ? tx.fee : null) },
    { header: "Notas", value: (tx) => tx.notes },
  ];
}

function destinationLine(tx: TransactionWithRelations) {
  if (tx.transaction_type !== "transfer") return undefined;
  const primary = getPrimaryLine(tx);
  return tx.amounts.find((line) => line !== primary);
}
