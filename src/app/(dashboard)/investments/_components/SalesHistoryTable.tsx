"use client";

import { useCallback, useMemo, useState } from "react";
import { History, SearchX, Trash2, Undo2 } from "lucide-react";
import { DataTableToolbar } from "@/components/data-table-toolbar";
import { FilterChipBar, FilterDropdown, type FilterChip } from "@/components/filter-dropdown";
import { NumericCell } from "@/components/numeric-cell";
import { PageButton } from "@/components/page-button";
import { RenderErrorBoundary } from "@/components/render-error-boundary";
import { RowActions } from "@/components/row-actions";
import { SearchInput } from "@/components/search-input";
import { StatCard, StatGrid } from "@/components/stat-card";
import { StateCard } from "@/components/state-card";
import { TruncatedText } from "@/components/truncated-text";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useConfirm } from "@/hooks/use-confirm";
import {
  useInvestmentSales,
  useDeleteInvestmentSale,
} from "@/hooks/useInvestments";
import { formatAmount } from "@/lib/format";
import { ASSET_TYPE_LABELS } from "@/types/investments";
import type { InvestmentSaleWithAccount, AssetType } from "@/types/investments";
import { ASSET_TYPE_OPTIONS, saleMatches, saleYear } from "./investment-filters";
import { formatExactQuantity, quantityDecimals, unitPriceDecimals } from "./investment-format";

const formatCount = (value: number) => value.toLocaleString("es-AR");

export function SalesHistoryTable() {
  const { data: sales, isLoading, error, refetch } = useInvestmentSales();
  const deleteMutation = useDeleteInvestmentSale();
  const { mutateAsync: deleteSale } = deleteMutation;
  const confirm = useConfirm();

  const [search, setSearch] = useState("");
  const [assetTypeFilter, setAssetTypeFilter] = useState<string | null>(null);
  const [yearFilter, setYearFilter] = useState<string | null>(null);

  const yearOptions = useMemo(() => {
    if (!sales) return [];
    const years = new Set(sales.map((s) => saleYear(s.sale_date)));
    return Array.from(years)
      .sort((a, b) => b - a)
      .map((year) => ({ value: String(year), label: String(year) }));
  }, [sales]);

  const filtered = useMemo(() => {
    if (!sales) return [];
    return sales.filter((s) =>
      saleMatches(s, { query: search, assetType: assetTypeFilter, year: yearFilter }),
    );
  }, [sales, search, assetTypeFilter, yearFilter]);

  const totals = useMemo(() => {
    // A sale without an exchange rate is left out of the totals.
    return filtered.reduce(
      (acc, s) => {
        if (s.realized_pnl_base === null) {
          acc.withoutRate += 1;
          return acc;
        }
        acc.proceeds += s.total_proceeds_base ?? 0;
        acc.fees += s.fees_base ?? 0;
        acc.tax += s.tax_base ?? 0;
        acc.cost += s.cost_basis_base ?? 0;
        acc.pnl += s.realized_pnl_base;
        return acc;
      },
      { proceeds: 0, fees: 0, tax: 0, cost: 0, pnl: 0, withoutRate: 0 },
    );
  }, [filtered]);

  const baseCurrencySymbol = filtered[0]?.base_currency
    ? (filtered[0].base_currency === "USD"
        ? "$"
        : filtered[0].base_currency === "EUR"
          ? "€"
          : filtered[0].base_currency)
    : "$";

  const clearFilters = useCallback(() => {
    setSearch("");
    setAssetTypeFilter(null);
    setYearFilter(null);
  }, []);

  const filterChips = useMemo(() => {
    const chips: FilterChip[] = [];
    if (assetTypeFilter !== null) {
      chips.push({
        id: "type",
        label: "Tipo",
        value: ASSET_TYPE_LABELS[assetTypeFilter as AssetType] ?? assetTypeFilter,
        onRemove: () => setAssetTypeFilter(null),
      });
    }
    if (yearFilter !== null) {
      chips.push({ id: "year", label: "Año", value: yearFilter, onRemove: () => setYearFilter(null) });
    }
    return chips;
  }, [assetTypeFilter, yearFilter]);

  // delete_investment_sale takes back the sale's credit (if it made one) and
  // restores one lot at the sale's cost basis, dated on the sale; a swap also
  // deletes the lot it bought, and refuses once that lot was sold, moved or
  // its cost edited.
  const handleDelete = useCallback(
    async (sale: InvestmentSaleWithAccount) => {
      const restored = `${formatExactQuantity(sale.quantity_sold)} ${sale.ticker ?? sale.asset_name}`;
      const cost = `${sale.currency_symbol} ${formatAmount(sale.cost_basis)}`;
      const confirmed = await confirm(
        sale.swap_lot_id
          ? {
              title: "¿Deshacer el intercambio?",
              description: `Se borra lo que recibiste y vuelven ${restored} como un lote del ${sale.sale_date} con costo ${cost}. No se puede si ya lo vendiste, transferiste o editaste.`,
              confirmLabel: "Deshacer",
              destructive: true,
            }
          : {
              title: `¿Borrar la venta de ${sale.asset_name}?`,
              description: `Vuelven ${restored} como un lote del ${sale.sale_date} con costo ${cost}. Si la venta acreditó efectivo, se quita de la cuenta.`,
              destructive: true,
            },
      );
      if (!confirmed) return;
      try {
        await deleteSale(sale.id);
      } catch {
        // toast handled in hook
      }
    },
    [confirm, deleteSale],
  );

  if (isLoading) {
    return <StateCard variant="loading" className="min-h-96" />;
  }

  // A failed refresh keeps what is on screen (QueryProvider says it failed).
  if (error && !sales) {
    return (
      <StateCard
        variant="error"
        title="No se pudo cargar el historial de ventas"
        error={error}
        className="min-h-96"
        onRetry={() => void refetch()}
      />
    );
  }

  if (!sales || sales.length === 0) {
    return (
      <StateCard
        variant="empty"
        icon={History}
        title="Sin ventas"
        description="Las ventas e intercambios que registres aparecen acá."
        className="min-h-96"
      />
    );
  }

  const deletingId = deleteMutation.isPending ? deleteMutation.variables : null;

  return (
    <div className="flex flex-col gap-4">
      <RenderErrorBoundary name="sales-summary" resetKeys={[totals]}>
        <StatGrid columns={4}>
          <StatCard
            label="Operaciones"
            value={filtered.length}
            format={formatCount}
            sub={
              totals.withoutRate === 0
                ? undefined
                : `${totals.withoutRate} sin cotización, fuera de los totales`
            }
          />
          <StatCard label="Bruto" value={totals.proceeds} currency={baseCurrencySymbol} />
          <StatCard
            label="Comisiones e impuestos"
            value={totals.fees + totals.tax}
            currency={baseCurrencySymbol}
          />
          <StatCard label="Resultado" value={totals.pnl} currency={baseCurrencySymbol} signTone />
        </StatGrid>
      </RenderErrorBoundary>

      <DataTableToolbar
        search={
          <SearchInput
            value={search}
            onValueChange={setSearch}
            resultCount={filtered.length}
            shortcut
            placeholder="Buscar activo, ticker o cuenta"
          />
        }
        filters={
          <>
            <FilterDropdown
              label="Tipo"
              options={ASSET_TYPE_OPTIONS}
              value={assetTypeFilter}
              onValueChange={setAssetTypeFilter}
            />
            <FilterDropdown
              label="Año"
              options={yearOptions}
              value={yearFilter}
              onValueChange={setYearFilter}
            />
          </>
        }
      >
        <FilterChipBar chips={filterChips} onClearAll={clearFilters} />
      </DataTableToolbar>

      <RenderErrorBoundary name="sales-table" resetKeys={[filtered]} className="min-h-72">
        {filtered.length === 0 ? (
          <StateCard
            variant="empty"
            icon={SearchX}
            title="Sin resultados"
            action={
              <PageButton variant="outline" onClick={clearFilters}>
                Limpiar filtros
              </PageButton>
            }
          />
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Activo</TableHead>
                  <TableHead>Ticker</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Cuenta</TableHead>
                  <TableHead className="text-right">Cantidad</TableHead>
                  <TableHead className="text-right">Precio</TableHead>
                  <TableHead className="text-right">Bruto</TableHead>
                  <TableHead className="text-right">Comis.</TableHead>
                  <TableHead className="text-right">Imp.</TableHead>
                  <TableHead className="text-right">Costo</TableHead>
                  <TableHead className="text-right">Resultado</TableHead>
                  <TableHead className="w-10">
                    <span className="sr-only">Acciones</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="text-xs tabular-nums whitespace-nowrap">{s.sale_date}</TableCell>
                    <TableCell className="font-medium">
                      <TruncatedText className="max-w-48">{s.asset_name}</TruncatedText>
                      {!s.swap_lot_id ? null : (
                        <span className="text-muted-foreground block text-[11px] font-normal">intercambio</span>
                      )}
                    </TableCell>
                    <TableCell>{!s.ticker ? null : <Badge variant="secondary">{s.ticker}</Badge>}</TableCell>
                    <TableCell className="text-xs">{ASSET_TYPE_LABELS[s.asset_type as AssetType]}</TableCell>
                    <TableCell className="text-muted-foreground text-xs">
                      <TruncatedText className="max-w-40">{s.account_name}</TruncatedText>
                    </TableCell>
                    <TableCell className="text-xs">
                      <NumericCell
                        value={s.quantity_sold}
                        decimals={quantityDecimals(s.quantity_sold, s.asset_type)}
                      />
                    </TableCell>
                    <TableCell className="text-xs">
                      <NumericCell
                        value={s.price_per_unit}
                        currency={s.currency_symbol}
                        decimals={unitPriceDecimals(s.price_per_unit)}
                      />
                    </TableCell>
                    <TableCell className="text-xs">
                      <NumericCell value={s.total_proceeds} currency={s.currency_symbol} />
                    </TableCell>
                    <TableCell className="text-xs">
                      <NumericCell value={s.fees} />
                    </TableCell>
                    <TableCell className="text-xs">
                      <NumericCell value={s.tax} />
                    </TableCell>
                    <TableCell className="text-xs">
                      <NumericCell value={s.cost_basis} />
                    </TableCell>
                    <TableCell className="font-medium">
                      <NumericCell value={s.realized_pnl} tone />
                    </TableCell>
                    <TableCell className="text-right">
                      {deletingId === s.id ? (
                        <Spinner className="text-muted-foreground mx-auto size-3.5" />
                      ) : (
                        <RowActions
                          actions={[
                            s.swap_lot_id
                              ? {
                                  label: "Deshacer intercambio",
                                  icon: Undo2,
                                  onSelect: () => void handleDelete(s),
                                  destructive: true,
                                }
                              : {
                                  label: "Borrar venta",
                                  icon: Trash2,
                                  onSelect: () => void handleDelete(s),
                                  destructive: true,
                                },
                          ]}
                        />
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </RenderErrorBoundary>
    </div>
  );
}
