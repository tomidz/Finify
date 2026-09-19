"use client";

import React, { useCallback, useMemo, useState } from "react";
import { ArrowLeftRight, Plus, RefreshCw, SearchX, TrendingUp } from "lucide-react";
import { DataTableToolbar } from "@/components/data-table-toolbar";
import { FilterChipBar, FilterDropdown, type FilterChip } from "@/components/filter-dropdown";
import { NumericCell } from "@/components/numeric-cell";
import { PageButton } from "@/components/page-button";
import { RenderErrorBoundary } from "@/components/render-error-boundary";
import { SearchInput } from "@/components/search-input";
import { StateCard } from "@/components/state-card";
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
  useInvestments,
  useDeleteInvestment,
  useCurrentPrices,
} from "@/hooks/useInvestments";
import { useBaseCurrency } from "@/hooks/useTransactions";
import { useCurrencies } from "@/hooks/useAccounts";
import { useAccountNetWorth } from "@/hooks/useNetWorth";
import { isCashLike, lotValueInBase, priceRequestFor, type PriceRequest } from "@/lib/asset-classes";
import { amountTone, formatAmount } from "@/lib/format";
import type { UnpricedReason } from "@/lib/server/prices";
import { cn } from "@/lib/utils";
import {
  ASSET_TYPE_LABELS,
  INVESTMENT_ACCOUNT_TYPES,
  holdingGroupKey,
} from "@/types/investments";
import type { InvestmentWithAccount, HoldingPosition } from "@/types/investments";
import { AccountsBreakdown } from "./AccountsBreakdown";
import { HoldingRows } from "./HoldingRows";
import { HoldingsSummary } from "./HoldingsSummary";
import {
  ASSET_TYPE_OPTIONS,
  HOLDINGS_VIEW_OPTIONS,
  holdingMatches,
  isHoldingsView,
  type HoldingsView,
} from "./investment-filters";
import { InvestmentDialog } from "./InvestmentDialog";
import { SellInvestmentDialog } from "./SellInvestmentDialog";
import { TransferPositionDialog } from "./TransferPositionDialog";
import { AdjustPositionDialog } from "./AdjustPositionDialog";
import { ManualPriceDialog } from "./ManualPriceDialog";
import { SwapInvestmentDialog } from "./SwapInvestmentDialog";

export function InvestmentsTable({ onCreate }: { onCreate: () => void }) {
  const { data: investments, isLoading, error, refetch } = useInvestments();
  const { mutateAsync: deleteInvestment } = useDeleteInvestment();
  const confirm = useConfirm();
  const {
    data: baseCurrency,
    error: baseCurrencyError,
    refetch: refetchBaseCurrency,
  } = useBaseCurrency();
  const { data: currencies } = useCurrencies();
  const {
    data: accountNetWorth,
    isLoading: netWorthLoading,
    error: netWorthError,
    refetch: refetchNetWorth,
  } = useAccountNetWorth(
    new Date().getFullYear(),
  );

  const investmentAccounts = useMemo(() => {
    if (!accountNetWorth?.accounts) return [];
    return accountNetWorth.accounts.filter((account) =>
      INVESTMENT_ACCOUNT_TYPES.has(account.account_type),
    );
  }, [accountNetWorth]);

  const currencySymbol = useMemo(() => {
    if (!baseCurrency) return "$";
    const found = currencies?.find((c) => c.code === baseCurrency);
    return found?.symbol ?? baseCurrency;
  }, [baseCurrency, currencies]);

  // One price lookup per distinct lot lookup.
  const tickersForPricing = useMemo(() => {
    if (!investments) return [];
    const unique = new Map<string, PriceRequest>();
    for (const inv of investments) {
      const request = priceRequestFor(inv);
      unique.set(request.key, request);
    }
    return Array.from(unique.values());
  }, [investments]);

  const {
    data: priceData,
    refresh: refetchPrices,
    isFetching: fetchingPrices,
    isLoading: pricesLoading,
    error: pricesError,
  } = useCurrentPrices(tickersForPricing, baseCurrency ?? "");
  // Nothing priced at all: market values are unknown, not the cost.
  const pricesFailed = !priceData && !!pricesError;

  // Aggregate into holdings
  const holdings = useMemo<HoldingPosition[]>(() => {
    if (!investments) return [];

    const groups = new Map<string, InvestmentWithAccount[]>();
    for (const inv of investments) {
      const key = holdingGroupKey(inv);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(inv);
    }

    return Array.from(groups.values()).map((group) => {
      const first = group[0];
      const totalQty = group.reduce((s, i) => s + i.quantity, 0);
      const totalCost = group.reduce((s, i) => s + i.total_cost, 0);
      const avgCost = totalQty > 0 ? totalCost / totalQty : 0;
      const ticker = first.ticker ?? first.asset_name;
      // Each lot at its own lookup's price, like the per-account valuation;
      // a lot without one counts at cost while another lot has a price.
      const pricedLot = group
        .map((inv) => ({ inv, key: priceRequestFor(inv).key }))
        .find(({ key }) => priceData?.prices[key] != null);
      const priceKey = pricedLot?.key ?? null;
      const currentPrice = priceKey !== null ? priceData!.prices[priceKey] : null;
      const currentValue =
        priceKey !== null
          ? group.reduce((s, inv) => {
              const price = priceData!.prices[priceRequestFor(inv).key];
              return s + (price != null ? inv.quantity * price : inv.total_cost);
            }, 0)
          : null;
      // Money held (cash, stablecoins) shows no gain or loss.
      const gainLoss =
        currentValue !== null && !isCashLike(first.asset_type)
          ? currentValue - totalCost
          : null;
      const gainLossPct =
        gainLoss !== null && totalCost > 0
          ? (gainLoss / totalCost) * 100
          : null;

      return {
        ticker,
        isin: first.isin ?? null,
        asset_name: first.asset_name,
        asset_type: first.asset_type,
        account_id: first.account_id,
        account_name: first.account_name,
        currency: first.currency,
        currency_symbol: first.currency_symbol,
        total_quantity: totalQty,
        avg_cost_per_unit: avgCost,
        total_cost: totalCost,
        current_price: currentPrice,
        manual_price_date: priceKey !== null ? (priceData!.manualDates[priceKey] ?? null) : null,
        current_value: currentValue,
        gain_loss: gainLoss,
        gain_loss_pct: gainLossPct,
        investments: group,
      };
    });
  }, [investments, priceData]);

  // Why each unpriced holding has no price, from its first lot the lookup
  // answered about.
  const unpricedReasons = useMemo(() => {
    const reasons = new Map<string, UnpricedReason>();
    if (!priceData) return reasons;
    for (const holding of holdings) {
      if (holding.current_price !== null) continue;
      const reason = holding.investments
        .map((inv) => priceData.unpriced[priceRequestFor(inv).key])
        .find((found) => found !== undefined);
      if (reason) reasons.set(holdingGroupKey(holding), reason);
    }
    return reasons;
  }, [holdings, priceData]);

  const [editingInvestment, setEditingInvestment] =
    useState<InvestmentWithAccount | null>(null);
  const [expandedHoldings, setExpandedHoldings] = useState<Set<string>>(new Set());
  const [transferHolding, setTransferHolding] = useState<HoldingPosition | null>(null);
  const [transferDialogOpen, setTransferDialogOpen] = useState(false);
  const [sellHolding, setSellHolding] = useState<HoldingPosition | null>(null);
  const [sellDialogOpen, setSellDialogOpen] = useState(false);
  const [adjustHolding, setAdjustHolding] = useState<HoldingPosition | null>(null);
  const [adjustDialogOpen, setAdjustDialogOpen] = useState(false);
  const [pricingHolding, setPricingHolding] = useState<HoldingPosition | null>(null);
  const [swapHolding, setSwapHolding] = useState<HoldingPosition | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [assetTypeFilter, setAssetTypeFilter] = useState<string | null>(null);
  const [accountFilter, setAccountFilter] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<HoldingsView>("flat");

  const toggleExpanded = useCallback((key: string) => {
    setExpandedHoldings((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const handleDelete = useCallback(
    async (investment: InvestmentWithAccount) => {
      // delete_investment gives back the purchase's cash for what is left of
      // the lot; what already left it (sold, moved) stays paid.
      const confirmed = await confirm({
        title: `¿Borrar la compra de ${investment.asset_name}?`,
        description: "Si la compra descontó efectivo, vuelve a la cuenta el costo de lo que queda del lote.",
        destructive: true,
      });
      if (!confirmed) return;
      try {
        await deleteInvestment(investment.id);
      } catch {
        // Error handled by mutation onError (toast)
      }
    },
    [confirm, deleteInvestment],
  );

  const openTransfer = useCallback((holding: HoldingPosition | null) => {
    setTransferHolding(holding);
    setTransferDialogOpen(true);
  }, []);
  const openSell = useCallback((holding: HoldingPosition) => {
    setSellHolding(holding);
    setSellDialogOpen(true);
  }, []);
  const openAdjust = useCallback((holding: HoldingPosition) => {
    setAdjustHolding(holding);
    setAdjustDialogOpen(true);
  }, []);

  // Everything on the screen is about the accounts in view: filtering by one
  // account takes its cash and its row with it, instead of leaving the other
  // brokers' cash in a total that no longer names them.
  const visibleAccounts = useMemo(
    () =>
      accountFilter === null
        ? investmentAccounts
        : investmentAccounts.filter((account) => account.id === accountFilter),
    [accountFilter, investmentAccounts],
  );

  const totalCashUninvested = useMemo(
    () => visibleAccounts.reduce((sum, account) => sum + (account.balance_base ?? 0), 0),
    [visibleAccounts],
  );

  const filteredHoldings = useMemo(
    () =>
      holdings.filter((holding) =>
        holdingMatches(holding, {
          query: searchTerm,
          assetType: assetTypeFilter,
          accountId: accountFilter,
        }),
      ),
    [accountFilter, assetTypeFilter, holdings, searchTerm],
  );

  // Grouped views: by account or by asset (combining the same asset across
  // accounts). Each group carries its own cost/current/gain subtotals.
  // Market value and cost per account in the base currency, from the same
  // prices as the rows; null for an account with a lot in a currency without
  // a rate.
  const valuationByAccount = useMemo(() => {
    if (!investments || !priceData) return undefined;
    const byAccount: Record<string, { current: number; cost: number } | null> = {};
    for (const inv of investments) {
      const value = lotValueInBase(inv, priceData.prices, priceData.ratesToBase);
      const entry = byAccount[inv.account_id] === undefined ? { current: 0, cost: 0 } : byAccount[inv.account_id];
      byAccount[inv.account_id] =
        entry && value ? { current: entry.current + value.current, cost: entry.cost + value.cost } : null;
    }
    return byAccount;
  }, [investments, priceData]);

  // Holdings are in their own currency and totals in the base currency: a
  // total with a holding whose rate is not known yet is unknown too.
  const sumInBase = useCallback(
    (holdings: HoldingPosition[], amountOf: (holding: HoldingPosition) => number) => {
      let total = 0;
      for (const holding of holdings) {
        const rate =
          holding.currency === baseCurrency ? 1 : priceData?.ratesToBase[holding.currency];
        if (rate == null) return null;
        total += amountOf(holding) * rate;
      }
      return total;
    },
    [priceData, baseCurrency],
  );

  const groupedHoldings = useMemo(() => {
    if (viewMode === "flat") return null;

    const groups = new Map<
      string,
      { key: string; label: string; items: HoldingPosition[] }
    >();
    for (const holding of filteredHoldings) {
      const key =
        viewMode === "account"
          ? holding.account_id
          : holding.ticker ?? holding.asset_name;
      const label =
        viewMode === "account" ? holding.account_name : holding.asset_name;
      if (!groups.has(key)) groups.set(key, { key, label, items: [] });
      groups.get(key)!.items.push(holding);
    }

    return Array.from(groups.values())
      .map((group) => {
        // Unpriced holdings count at cost, same as the summary cards; money
        // held counts at its value on both sides.
        const cost = sumInBase(group.items, (h) =>
          isCashLike(h.asset_type) ? (h.current_value ?? h.total_cost) : h.total_cost,
        );
        const current = sumInBase(group.items, (h) => h.current_value ?? h.total_cost);
        const gain = cost !== null && current !== null ? current - cost : null;
        const gainPct = gain !== null && cost! > 0 ? (gain / cost!) * 100 : null;
        return { ...group, cost, current, gain, gainPct };
      })
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [viewMode, filteredHoldings, sumInBase]);

  // Holdings without a live price are valued at cost (same fallback the
  // server uses). One unpriced asset used to blank the whole summary.
  // Cash and stablecoins held in the accounts count as cash, not as invested.
  const summaryTotals = useMemo(() => {
    const positions = filteredHoldings.filter((h) => !isCashLike(h.asset_type));
    const invested = sumInBase(positions, (h) => h.total_cost);
    const current = sumInBase(positions, (h) => h.current_value ?? h.total_cost);
    const gain = invested !== null && current !== null ? current - invested : null;
    const gainPct = gain !== null && invested! > 0 ? (gain / invested!) * 100 : null;
    const unpricedCount = positions.filter((h) => h.current_value === null).length;
    const cashHeld = sumInBase(
      filteredHoldings.filter((h) => isCashLike(h.asset_type)),
      (h) => h.current_value ?? h.total_cost,
    );
    // The oldest rate a holding in another currency is converted at, shown
    // when it is not today's.
    const fxRateDate =
      filteredHoldings
        .filter((h) => h.currency !== baseCurrency)
        .map((h) => priceData?.rateDatesToBase[h.currency])
        .filter((date): date is string => date != null)
        .sort()[0] ?? null;
    return { invested, current, gain, gainPct, unpricedCount, cashHeld, fxRateDate };
  }, [filteredHoldings, sumInBase, baseCurrency, priceData]);

  const accountOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const holding of holdings) {
      seen.set(holding.account_id, holding.account_name);
    }
    return Array.from(seen.entries())
      .sort((a, b) => a[1].localeCompare(b[1]))
      .map(([value, label]) => ({ value, label }));
  }, [holdings]);

  const clearFilters = useCallback(() => {
    setSearchTerm("");
    setAssetTypeFilter(null);
    setAccountFilter(null);
  }, []);

  const filterChips = useMemo(() => {
    const chips: FilterChip[] = [];
    if (assetTypeFilter !== null) {
      chips.push({
        id: "type",
        label: "Tipo",
        value: ASSET_TYPE_LABELS[assetTypeFilter as keyof typeof ASSET_TYPE_LABELS] ?? assetTypeFilter,
        onRemove: () => setAssetTypeFilter(null),
      });
    }
    if (accountFilter !== null) {
      chips.push({
        id: "account",
        label: "Cuenta",
        value: accountOptions.find((option) => option.value === accountFilter)?.label ?? "—",
        onRemove: () => setAccountFilter(null),
      });
    }
    return chips;
  }, [accountFilter, accountOptions, assetTypeFilter]);

  if (isLoading) {
    return <StateCard variant="loading" className="min-h-96" />;
  }

  // Holdings are valued in the base currency: without it no total is right.
  // A failed refresh keeps what is on screen (QueryProvider says it failed).
  const loadError = (!investments && error) || (!baseCurrency && baseCurrencyError);
  if (loadError) {
    return (
      <StateCard
        variant="error"
        title="No se pudieron cargar las inversiones"
        error={loadError}
        className="min-h-96"
        onRetry={() => {
          void refetch();
          if (baseCurrencyError) void refetchBaseCurrency();
        }}
      />
    );
  }

  const totalsLoading = !baseCurrency;
  // Without the accounts' balances the cash is unknown, not 0.
  const cashUninvested =
    accountNetWorth && summaryTotals.cashHeld !== null
      ? totalCashUninvested + summaryTotals.cashHeld
      : null;

  const renderHolding = (holding: HoldingPosition) => {
    const key = holdingGroupKey(holding);
    return (
      <HoldingRows
        key={key}
        holding={holding}
        isExpanded={expandedHoldings.has(key)}
        unpricedReason={unpricedReasons.get(key)}
        onToggleExpanded={toggleExpanded}
        onTransfer={openTransfer}
        onSell={openSell}
        onAdjust={openAdjust}
        onSetPrice={setPricingHolding}
        onSwap={setSwapHolding}
        onEdit={setEditingInvestment}
        onDelete={handleDelete}
      />
    );
  };

  return (
    <div className="flex flex-col gap-4">
      {holdings.length === 0 ? null : (
        <DataTableToolbar
          search={
            <SearchInput
              value={searchTerm}
              onValueChange={setSearchTerm}
              resultCount={filteredHoldings.length}
              shortcut
              placeholder="Buscar activo, ticker, ISIN o cuenta"
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
                label="Cuenta"
                options={accountOptions}
                value={accountFilter}
                onValueChange={setAccountFilter}
              />
              <FilterDropdown
                label="Vista"
                options={HOLDINGS_VIEW_OPTIONS}
                value={viewMode}
                onValueChange={(value) => {
                  if (isHoldingsView(value)) setViewMode(value);
                }}
                clearable={false}
              />
            </>
          }
          actions={
            <>
              <PageButton
                variant="outline"
                onClick={() => refetchPrices()}
                disabled={fetchingPrices || tickersForPricing.length === 0}
              >
                {fetchingPrices ? <Spinner className="size-3.5" /> : <RefreshCw aria-hidden />}
                Actualizar precios
              </PageButton>
              <PageButton variant="outline" icon={ArrowLeftRight} onClick={() => openTransfer(null)}>
                Transferir
              </PageButton>
            </>
          }
        >
          <FilterChipBar chips={filterChips} onClearAll={clearFilters} />
        </DataTableToolbar>
      )}

      {filteredHoldings.length === 0 && cashUninvested === 0 ? null : (
        <RenderErrorBoundary name="investments-summary" resetKeys={[summaryTotals]}>
          <HoldingsSummary
            currencySymbol={currencySymbol}
            cashUninvested={cashUninvested}
            invested={summaryTotals.invested}
            current={summaryTotals.current}
            gain={summaryTotals.gain}
            gainPct={summaryTotals.gainPct}
            unpricedCount={summaryTotals.unpricedCount}
            fxRateDate={summaryTotals.fxRateDate}
            pricesFailed={pricesFailed}
            cashLoading={totalsLoading || netWorthLoading}
            cashFailed={!!netWorthError && !accountNetWorth}
            totalsLoading={totalsLoading}
            valueLoading={totalsLoading || pricesLoading}
          />
        </RenderErrorBoundary>
      )}

      <RenderErrorBoundary name="investment-accounts-breakdown" resetKeys={[visibleAccounts, valuationByAccount]}>
        {netWorthError && !accountNetWorth ? (
          <StateCard
            variant="error"
            size="compact"
            error={netWorthError}
            title="No se pudieron cargar las cuentas"
            onRetry={() => void refetchNetWorth()}
          />
        ) : (
          <AccountsBreakdown
            accounts={visibleAccounts}
            valuationByAccount={valuationByAccount}
            currencySymbol={currencySymbol}
            pricesFailed={pricesFailed}
          />
        )}
      </RenderErrorBoundary>

      <RenderErrorBoundary name="holdings-table" resetKeys={[filteredHoldings, groupedHoldings]} className="min-h-72">
        {holdings.length === 0 ? (
          <StateCard
            variant="empty"
            icon={TrendingUp}
            title="Sin inversiones"
            description="Registrá una compra para ver tu cartera."
            action={
              <PageButton variant="outline" icon={Plus} onClick={onCreate}>
                Nueva inversión
              </PageButton>
            }
          />
        ) : filteredHoldings.length === 0 ? (
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
                  <TableHead>Activo</TableHead>
                  <TableHead>Ticker</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Cuenta</TableHead>
                  <TableHead className="text-right">Cantidad</TableHead>
                  <TableHead className="text-right">Costo prom.</TableHead>
                  <TableHead className="text-right">Costo</TableHead>
                  <TableHead className="text-right">Precio</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead className="text-right">G/P</TableHead>
                  <TableHead className="w-10">
                    <span className="sr-only">Acciones</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {!groupedHoldings
                  ? filteredHoldings.map(renderHolding)
                  : groupedHoldings.map((group) => {
                      const current = pricesFailed ? null : group.current;
                      const gain = pricesFailed ? null : group.gain;
                      return (
                        <React.Fragment key={group.key}>
                          <TableRow className="bg-muted/40 hover:bg-muted/40">
                            <TableCell colSpan={6} className="font-semibold">
                              {group.label}
                              <span className="text-muted-foreground ml-2 text-xs font-normal">
                                ({group.items.length})
                              </span>
                            </TableCell>
                            <TableCell className="font-semibold">
                              <NumericCell value={group.cost} currency={currencySymbol} />
                            </TableCell>
                            <TableCell />
                            <TableCell className="font-semibold">
                              <NumericCell value={current} currency={currencySymbol} />
                            </TableCell>
                            <TableCell className="font-semibold">
                              <div className="flex items-baseline justify-end gap-1">
                                <NumericCell value={gain} currency={currencySymbol} tone />
                                {gain === null || group.gainPct === null ? null : (
                                  <span className={cn("text-[11px] font-normal tabular-nums", amountTone(gain))}>
                                    ({formatAmount(group.gainPct)}%)
                                  </span>
                                )}
                              </div>
                            </TableCell>
                            <TableCell />
                          </TableRow>
                          {group.items.map(renderHolding)}
                        </React.Fragment>
                      );
                    })}
              </TableBody>
            </Table>
          </div>
        )}
      </RenderErrorBoundary>

      {!editingInvestment ? null : (
        <InvestmentDialog
          investment={editingInvestment}
          open
          onOpenChange={(open) => {
            if (!open) setEditingInvestment(null);
          }}
        />
      )}

      <TransferPositionDialog
        holdings={holdings}
        holding={transferHolding}
        open={transferDialogOpen}
        onOpenChange={(open) => {
          setTransferDialogOpen(open);
          if (!open) setTransferHolding(null);
        }}
      />

      <SellInvestmentDialog
        holding={sellHolding}
        open={sellDialogOpen}
        onOpenChange={(open) => {
          setSellDialogOpen(open);
          if (!open) setSellHolding(null);
        }}
      />

      <AdjustPositionDialog
        holding={adjustHolding}
        open={adjustDialogOpen}
        onOpenChange={(open) => {
          setAdjustDialogOpen(open);
          if (!open) setAdjustHolding(null);
        }}
      />

      <SwapInvestmentDialog
        holding={swapHolding}
        onOpenChange={(open) => !open && setSwapHolding(null)}
      />

      <ManualPriceDialog
        holding={pricingHolding}
        onOpenChange={(open) => !open && setPricingHolding(null)}
      />
    </div>
  );
}
