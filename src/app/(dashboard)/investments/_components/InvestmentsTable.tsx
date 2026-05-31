"use client";

import React, { useCallback, useMemo, useState } from "react";
import { Plus, Pencil, Trash2, RefreshCw, ChevronDown, ChevronRight, ArrowLeftRight, TrendingDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useInvestments,
  useDeleteInvestment,
  useCurrentPrices,
} from "@/hooks/useInvestments";
import { useBaseCurrency } from "@/hooks/useTransactions";
import { useCurrencies } from "@/hooks/useAccounts";
import { useAccountNetWorth } from "@/hooks/useNetWorth";
import { ACCOUNT_TYPE_LABELS } from "@/types/accounts";

const INVESTMENT_ACCOUNT_TYPES = new Set([
  "investment_broker",
  "crypto_exchange",
  "crypto_wallet",
]);
import { formatAmount, amountTone } from "@/lib/format";
import { ASSET_TYPE_LABELS } from "@/types/investments";
import type { InvestmentWithAccount, HoldingPosition } from "@/types/investments";
import { InvestmentDialog } from "./InvestmentDialog";
import { SellInvestmentDialog } from "./SellInvestmentDialog";
import { TransferPositionDialog } from "./TransferPositionDialog";

export function InvestmentsTable() {
  const { data: investments, isLoading, isError, error, refetch } = useInvestments();
  const deleteMutation = useDeleteInvestment();
  const { data: baseCurrency } = useBaseCurrency();
  const { data: currencies } = useCurrencies();
  const { data: accountNetWorth } = useAccountNetWorth(new Date().getFullYear());

  const investmentAccounts = useMemo(() => {
    if (!accountNetWorth?.accounts) return [];
    return accountNetWorth.accounts.filter((account) =>
      INVESTMENT_ACCOUNT_TYPES.has(account.account_type),
    );
  }, [accountNetWorth]);

  const totalCashUninvested = useMemo(
    () =>
      investmentAccounts.reduce(
        (sum, account) => sum + (account.balance_base ?? 0),
        0,
      ),
    [investmentAccounts],
  );

  const currencySymbol = useMemo(() => {
    if (!baseCurrency) return "$";
    const found = currencies?.find((c) => c.code === baseCurrency);
    return found?.symbol ?? baseCurrency;
  }, [baseCurrency, currencies]);

  // Get unique tickers for price fetching
  const tickersForPricing = useMemo(() => {
    if (!investments) return [];
    const unique = new Map<
      string,
      { key: string; ticker?: string | null; isin?: string | null; assetType: string }
    >();
    for (const inv of investments) {
      const key = inv.ticker?.trim() || inv.isin?.trim() || inv.asset_name.trim();
      unique.set(key, {
        key,
        ticker: inv.ticker,
        isin: inv.isin,
        assetType: inv.asset_type,
      });
    }
    return Array.from(unique.values());
  }, [investments]);

  const {
    data: prices,
    refetch: refetchPrices,
    isFetching: fetchingPrices,
  } = useCurrentPrices(tickersForPricing, baseCurrency ?? "USD");

  // Aggregate into holdings
  const holdings = useMemo<HoldingPosition[]>(() => {
    if (!investments) return [];

    const groupKey = (inv: InvestmentWithAccount) =>
      `${inv.ticker ?? inv.asset_name}::${inv.account_id}`;

    const groups = new Map<string, InvestmentWithAccount[]>();
    for (const inv of investments) {
      const key = groupKey(inv);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(inv);
    }

    return Array.from(groups.values()).map((group) => {
      const first = group[0];
      const totalQty = group.reduce((s, i) => s + i.quantity, 0);
      const totalCost = group.reduce((s, i) => s + i.total_cost, 0);
      const avgCost = totalQty > 0 ? totalCost / totalQty : 0;
      const ticker = first.ticker ?? first.asset_name;
      const priceKey = first.ticker?.trim() || first.isin?.trim() || first.asset_name.trim();
      const currentPrice = prices?.[priceKey] ?? null;
      const currentValue =
        currentPrice !== null ? totalQty * currentPrice : null;
      const gainLoss =
        currentValue !== null ? currentValue - totalCost : null;
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
        current_value: currentValue,
        gain_loss: gainLoss,
        gain_loss_pct: gainLossPct,
        investments: group,
      };
    });
  }, [investments, prices]);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingInvestment, setEditingInvestment] =
    useState<InvestmentWithAccount | null>(null);
  const [deletingInvestment, setDeletingInvestment] =
    useState<InvestmentWithAccount | null>(null);
  const [expandedHoldings, setExpandedHoldings] = useState<Set<string>>(new Set());
  const [transferHolding, setTransferHolding] = useState<HoldingPosition | null>(null);
  const [transferDialogOpen, setTransferDialogOpen] = useState(false);
  const [sellHolding, setSellHolding] = useState<HoldingPosition | null>(null);
  const [sellDialogOpen, setSellDialogOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [assetTypeFilter, setAssetTypeFilter] = useState("all");
  const [accountFilter, setAccountFilter] = useState("all");
  const [viewMode, setViewMode] = useState<"flat" | "account" | "asset">("flat");

  const toggleExpanded = useCallback((key: string) => {
    setExpandedHoldings((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const handleCreate = useCallback(() => {
    setEditingInvestment(null);
    setDialogOpen(true);
  }, []);

  const handleEdit = useCallback((inv: InvestmentWithAccount) => {
    setEditingInvestment(inv);
    setDialogOpen(true);
  }, []);

  const handleDelete = async () => {
    if (!deletingInvestment) return;
    try {
      await deleteMutation.mutateAsync(deletingInvestment.id);
      setDeletingInvestment(null);
    } catch {
      // Error handled by mutation onError (toast)
    }
  };

  const filteredHoldings = useMemo(() => {
    const search = searchTerm.trim().toLowerCase();

    return holdings.filter((holding) => {
      if (assetTypeFilter !== "all" && holding.asset_type !== assetTypeFilter) {
        return false;
      }

      if (accountFilter !== "all" && holding.account_id !== accountFilter) {
        return false;
      }

      if (!search) return true;

      return [
        holding.asset_name,
        holding.ticker ?? "",
        holding.isin ?? "",
        holding.account_name,
        holding.currency,
      ]
        .join(" ")
        .toLowerCase()
        .includes(search);
    });
  }, [accountFilter, assetTypeFilter, holdings, searchTerm]);

  // Grouped views: by account or by asset (combining the same asset across
  // accounts). Each group carries its own cost/current/gain subtotals.
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
        const cost = group.items.reduce((s, h) => s + h.total_cost, 0);
        const allValued = group.items.every((h) => h.current_value !== null);
        const current = allValued
          ? group.items.reduce((s, h) => s + (h.current_value ?? 0), 0)
          : null;
        const gain = current !== null ? current - cost : null;
        const gainPct = gain !== null && cost > 0 ? (gain / cost) * 100 : null;
        return { ...group, cost, current, gain, gainPct };
      })
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [viewMode, filteredHoldings]);

  const hasActiveFilters =
    searchTerm.trim().length > 0 ||
    assetTypeFilter !== "all" ||
    accountFilter !== "all";

  const accountOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const holding of holdings) {
      seen.set(holding.account_id, holding.account_name);
    }
    return Array.from(seen.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [holdings]);

  const clearFilters = useCallback(() => {
    setSearchTerm("");
    setAssetTypeFilter("all");
    setAccountFilter("all");
  }, []);

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-10 w-40" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (isError && error) {
    return (
      <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-center">
        <p className="text-destructive font-medium">Error al cargar inversiones</p>
        <p className="text-muted-foreground mt-1 text-sm">{error.message}</p>
        <Button variant="outline" size="sm" className="mt-3" onClick={() => refetch()}>
          Reintentar
        </Button>
      </div>
    );
  }

  const renderHolding = (holding: HoldingPosition) => {
    const key = `${holding.ticker}::${holding.account_id}`;
    return (
      <HoldingRows
        key={key}
        holding={holding}
        isExpanded={expandedHoldings.has(key)}
        onToggleExpanded={toggleExpanded}
        onTransfer={(selectedHolding) => {
          setTransferHolding(selectedHolding);
          setTransferDialogOpen(true);
        }}
        onSell={(selectedHolding) => {
          setSellHolding(selectedHolding);
          setSellDialogOpen(true);
        }}
        onEdit={handleEdit}
        onDelete={setDeletingInvestment}
      />
    );
  };

  return (
    <>
      <div className="flex items-center justify-between">
        <Button
          variant="outline"
          size="sm"
          onClick={() => refetchPrices()}
          disabled={fetchingPrices || tickersForPricing.length === 0}
        >
          <RefreshCw
            className={`mr-1 size-4 ${fetchingPrices ? "animate-spin" : ""}`}
          />
          Actualizar precios
        </Button>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setTransferHolding(null);
              setTransferDialogOpen(true);
            }}
            disabled={holdings.length === 0}
          >
            <ArrowLeftRight className="mr-1 size-4" />
            Transferir posición
          </Button>
          <Button onClick={handleCreate} size="sm">
            <Plus className="mr-1 size-4" />
            Nueva inversión
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-1 flex-col gap-3 sm:flex-row">
          <Input
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Buscar activo, ticker, ISIN o cuenta"
            className="sm:max-w-sm"
          />
          <Select value={assetTypeFilter} onValueChange={setAssetTypeFilter}>
            <SelectTrigger className="w-full sm:w-44">
              <SelectValue placeholder="Tipo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los tipos</SelectItem>
              {Object.entries(ASSET_TYPE_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={accountFilter} onValueChange={setAccountFilter}>
            <SelectTrigger className="w-full sm:w-56">
              <SelectValue placeholder="Cuenta" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas las cuentas</SelectItem>
              {accountOptions.map(([id, name]) => (
                <SelectItem key={id} value={id}>
                  {name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={viewMode}
            onValueChange={(value) =>
              setViewMode(value as "flat" | "account" | "asset")
            }
          >
            <SelectTrigger className="w-full sm:w-52">
              <SelectValue placeholder="Vista" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="flat">Por activo y cuenta</SelectItem>
              <SelectItem value="account">Agrupar por cuenta</SelectItem>
              <SelectItem value="asset">Agrupar por activo</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button variant="outline" onClick={clearFilters} disabled={!hasActiveFilters}>
          Limpiar filtros
        </Button>
      </div>

      <InvestmentsSummaryCards
        holdingsCount={filteredHoldings.length}
        currencySymbol={currencySymbol}
        totalCashUninvested={totalCashUninvested}
        totalInvested={filteredHoldings.reduce((sum, holding) => sum + holding.total_cost, 0)}
        totalCurrentValue={
          filteredHoldings.every((holding) => holding.current_value !== null)
            ? filteredHoldings.reduce((sum, holding) => sum + (holding.current_value ?? 0), 0)
            : null
        }
        totalGainLoss={
          filteredHoldings.every((holding) => holding.current_value !== null)
            ? filteredHoldings.reduce(
                (sum, holding) => sum + ((holding.current_value ?? 0) - holding.total_cost),
                0,
              )
            : null
        }
        totalGainLossPct={
          filteredHoldings.every((holding) => holding.current_value !== null) &&
          filteredHoldings.reduce((sum, holding) => sum + holding.total_cost, 0) > 0
            ? (filteredHoldings.reduce(
                (sum, holding) => sum + ((holding.current_value ?? 0) - holding.total_cost),
                0,
              ) /
                filteredHoldings.reduce((sum, holding) => sum + holding.total_cost, 0)) *
              100
            : null
        }
      />

      <InvestmentAccountsBreakdown
        accounts={investmentAccounts}
        currencySymbol={currencySymbol}
      />

      {/* Holdings Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Activo</TableHead>
              <TableHead>Ticker</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Cuenta</TableHead>
              <TableHead className="text-right">Cant.</TableHead>
              <TableHead className="text-right">Costo Prom.</TableHead>
              <TableHead className="text-right">Costo Total</TableHead>
              <TableHead className="text-right">Precio Actual</TableHead>
              <TableHead className="text-right">Valor Actual</TableHead>
              <TableHead className="text-right">G/P</TableHead>
              <TableHead className="w-20 text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredHoldings.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={11}
                  className="h-32 text-center text-muted-foreground"
                >
                  <div className="flex flex-col items-center justify-center gap-3">
                    <p className="text-sm">
                      No hay inversiones registradas. Agregá tu primera
                      inversión.
                    </p>
                    <Button
                      onClick={handleCreate}
                      variant="outline"
                      size="sm"
                    >
                      <Plus className="mr-1 size-4" />
                      Nueva inversión
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ) : groupedHoldings ? (
              groupedHoldings.map((group) => (
                <React.Fragment key={group.key}>
                  <TableRow className="bg-muted/40 hover:bg-muted/40">
                    <TableCell colSpan={6} className="font-semibold">
                      {group.label}
                      <span className="text-muted-foreground ml-2 text-xs font-normal">
                        ({group.items.length})
                      </span>
                    </TableCell>
                    <TableCell className="text-right font-semibold">
                      {currencySymbol} {formatAmount(group.cost)}
                    </TableCell>
                    <TableCell />
                    <TableCell className="text-right font-semibold">
                      {group.current !== null
                        ? `${currencySymbol} ${formatAmount(group.current)}`
                        : "—"}
                    </TableCell>
                    <TableCell
                      className={`text-right font-semibold ${
                        group.gain === null
                          ? ""
                          : group.gain >= 0
                            ? "text-green-600"
                            : "text-red-600"
                      }`}
                    >
                      {group.gain !== null
                        ? `${group.gain >= 0 ? "▲" : "▼"} ${currencySymbol} ${formatAmount(
                            Math.abs(group.gain),
                          )}${group.gainPct !== null ? ` (${formatAmount(Math.abs(group.gainPct))}%)` : ""}`
                        : "—"}
                    </TableCell>
                    <TableCell />
                  </TableRow>
                  {group.items.map((holding) => renderHolding(holding))}
                </React.Fragment>
              ))
            ) : (
              filteredHoldings.map((holding) => renderHolding(holding))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Create/Edit Dialog */}
      {(dialogOpen || editingInvestment) && (
        <InvestmentDialog
          investment={editingInvestment}
          open={dialogOpen}
          onOpenChange={setDialogOpen}
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

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={!!deletingInvestment}
        onOpenChange={(open) => !open && setDeletingInvestment(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Eliminar inversión</DialogTitle>
            <DialogDescription>
              ¿Estás seguro de que querés eliminar la inversión de{" "}
              <span className="font-semibold">
                {deletingInvestment?.asset_name}
              </span>
              ? Esta acción no se puede deshacer.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setDeletingInvestment(null)}
              disabled={deleteMutation.isPending}
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? "Eliminando..." : "Eliminar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

const InvestmentsSummaryCards = React.memo(function InvestmentsSummaryCards({
  holdingsCount,
  currencySymbol,
  totalCashUninvested,
  totalInvested,
  totalCurrentValue,
  totalGainLoss,
  totalGainLossPct,
}: {
  holdingsCount: number;
  currencySymbol: string;
  totalCashUninvested: number;
  totalInvested: number;
  totalCurrentValue: number | null;
  totalGainLoss: number | null;
  totalGainLossPct: number | null;
}) {
  if (holdingsCount === 0 && totalCashUninvested === 0) return null;

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <Card className="gap-0 py-0">
        <CardHeader className="px-4 pt-4 pb-2">
          <CardDescription>Cash sin invertir</CardDescription>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <p className="text-2xl font-bold">
            {currencySymbol} {formatAmount(totalCashUninvested)}
          </p>
        </CardContent>
      </Card>

      <Card className="gap-0 py-0">
        <CardHeader className="px-4 pt-4 pb-2">
          <CardDescription>Total Invertido</CardDescription>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <p className="text-2xl font-bold">
            {currencySymbol} {formatAmount(totalInvested)}
          </p>
        </CardContent>
      </Card>

      <Card className="gap-0 py-0">
        <CardHeader className="px-4 pt-4 pb-2">
          <CardDescription>Valor Actual</CardDescription>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <p className="text-2xl font-bold">
            {totalCurrentValue !== null
              ? `${currencySymbol} ${formatAmount(totalCurrentValue)}`
              : "—"}
          </p>
        </CardContent>
      </Card>

      <Card className="gap-0 py-0">
        <CardHeader className="px-4 pt-4 pb-2">
          <CardDescription>Ganancia / Pérdida</CardDescription>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          {totalGainLoss !== null ? (
            <div className="flex items-baseline gap-2">
              <p className={`text-2xl font-bold ${amountTone(totalGainLoss)}`}>
                {currencySymbol} {formatAmount(totalGainLoss)}
              </p>
              <span className={`text-sm font-medium ${amountTone(totalGainLoss)}`}>
                ({totalGainLossPct !== null ? formatAmount(totalGainLossPct) : "—"}%)
              </span>
            </div>
          ) : (
            <p className="text-2xl font-bold text-muted-foreground">—</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
});

type InvestmentAccountBreakdownRow = {
  id: string;
  name: string;
  account_type: string;
  balance_base: number;
  investment_value_base: number;
};

const InvestmentAccountsBreakdown = React.memo(function InvestmentAccountsBreakdown({
  accounts,
  currencySymbol,
}: {
  accounts: InvestmentAccountBreakdownRow[];
  currencySymbol: string;
}) {
  if (accounts.length === 0) return null;

  return (
    <Card className="gap-0 py-0">
      <CardHeader className="px-4 pt-4 pb-2">
        <CardDescription>Cash e inversiones por cuenta</CardDescription>
      </CardHeader>
      <CardContent className="px-0 pb-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Cuenta</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead className="text-right">Cash sin invertir</TableHead>
              <TableHead className="text-right">Invertido (costo)</TableHead>
              <TableHead className="text-right">Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {accounts.map((account) => {
              const cash = account.balance_base;
              const invested = account.investment_value_base;
              const label =
                ACCOUNT_TYPE_LABELS[
                  account.account_type as keyof typeof ACCOUNT_TYPE_LABELS
                ] ?? account.account_type;
              return (
                <TableRow key={account.id}>
                  <TableCell className="font-medium">{account.name}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {label}
                  </TableCell>
                  <TableCell className="text-right">
                    {currencySymbol} {formatAmount(cash)}
                  </TableCell>
                  <TableCell className="text-right">
                    {currencySymbol} {formatAmount(invested)}
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    {currencySymbol} {formatAmount(cash + invested)}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
});

const HoldingRows = React.memo(function HoldingRows({
  holding,
  isExpanded,
  onToggleExpanded,
  onTransfer,
  onSell,
  onEdit,
  onDelete,
}: {
  holding: HoldingPosition;
  isExpanded: boolean;
  onToggleExpanded: (key: string) => void;
  onTransfer: (holding: HoldingPosition) => void;
  onSell: (holding: HoldingPosition) => void;
  onEdit: (investment: InvestmentWithAccount) => void;
  onDelete: (investment: InvestmentWithAccount) => void;
}) {
  const holdingKey = `${holding.ticker}::${holding.account_id}`;
  const singleInv =
    holding.investments.length === 1
      ? (holding.investments[0] as InvestmentWithAccount)
      : null;
  const isMulti = !singleInv;

  return (
    <React.Fragment>
      <TableRow
        className={isMulti ? "cursor-pointer" : undefined}
        onClick={isMulti ? () => onToggleExpanded(holdingKey) : undefined}
      >
        <TableCell className="font-medium">
          <div className="flex items-center gap-1">
            {isMulti &&
              (isExpanded ? (
                <ChevronDown className="size-4 text-muted-foreground" />
              ) : (
                <ChevronRight className="size-4 text-muted-foreground" />
              ))}
            {holding.asset_name}
          </div>
        </TableCell>
        <TableCell>
          {holding.ticker && <Badge variant="secondary">{holding.ticker}</Badge>}
        </TableCell>
        <TableCell className="text-xs">{ASSET_TYPE_LABELS[holding.asset_type]}</TableCell>
        <TableCell className="text-xs text-muted-foreground">{holding.account_name}</TableCell>
        <TableCell className="text-right">{formatAmount(holding.total_quantity)}</TableCell>
        <TableCell className="text-right">
          {holding.currency_symbol} {formatAmount(holding.avg_cost_per_unit)}
        </TableCell>
        <TableCell className="text-right">
          {holding.currency_symbol} {formatAmount(holding.total_cost)}
        </TableCell>
        <TableCell className="text-right">
          {holding.current_price !== null
            ? `${holding.currency_symbol} ${formatAmount(holding.current_price)}`
            : "—"}
        </TableCell>
        <TableCell className="text-right">
          {holding.current_value !== null
            ? `${holding.currency_symbol} ${formatAmount(holding.current_value)}`
            : "—"}
        </TableCell>
        <TableCell className="text-right">
          {holding.gain_loss !== null ? (
            <div>
              <span className={`text-sm font-medium ${amountTone(holding.gain_loss)}`}>
                {formatAmount(holding.gain_loss)}
              </span>
              {holding.gain_loss_pct !== null && (
                <span className={`ml-1 text-xs ${amountTone(holding.gain_loss)}`}>
                  ({formatAmount(holding.gain_loss_pct)}%)
                </span>
              )}
            </div>
          ) : (
            "—"
          )}
        </TableCell>
        <TableCell className="text-right">
          {singleInv ? (
            <div className="flex justify-end gap-1">
              <Button variant="ghost" size="icon" aria-label="Vender" onClick={() => onSell(holding)}>
                <TrendingDown className="size-4" />
              </Button>
              <Button variant="ghost" size="icon" aria-label="Transferir posicion" onClick={() => onTransfer(holding)}>
                <ArrowLeftRight className="size-4" />
              </Button>
              <Button variant="ghost" size="icon" aria-label="Editar inversión" onClick={() => onEdit(singleInv)}>
                <Pencil className="size-4" />
              </Button>
              <Button variant="ghost" size="icon" aria-label="Eliminar inversión" onClick={() => onDelete(singleInv)}>
                <Trash2 className="size-4" />
              </Button>
            </div>
          ) : (
            <div className="flex justify-end items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                aria-label="Vender"
                onClick={(e) => {
                  e.stopPropagation();
                  onSell(holding);
                }}
              >
                <TrendingDown className="size-4" />
              </Button>
              <span className="text-xs text-muted-foreground">{holding.investments.length} compras</span>
            </div>
          )}
        </TableCell>
      </TableRow>
      {isMulti &&
        isExpanded &&
        (holding.investments as InvestmentWithAccount[]).map((inv) => (
          <TableRow key={inv.id} className="bg-muted/30">
            <TableCell className="pl-10 text-xs text-muted-foreground">{inv.purchase_date}</TableCell>
            <TableCell />
            <TableCell />
            <TableCell />
            <TableCell className="text-right text-xs">{formatAmount(inv.quantity)}</TableCell>
            <TableCell className="text-right text-xs">
              {inv.currency_symbol} {formatAmount(inv.price_per_unit)}
            </TableCell>
            <TableCell className="text-right text-xs">
              {inv.currency_symbol} {formatAmount(inv.total_cost)}
            </TableCell>
            <TableCell />
            <TableCell />
            <TableCell />
            <TableCell className="text-right">
              <div className="flex justify-end gap-1">
                <Button variant="ghost" size="icon" className="size-7" onClick={() => onTransfer(holding)}>
                  <ArrowLeftRight className="size-3.5" />
                </Button>
                <Button variant="ghost" size="icon" className="size-7" onClick={() => onEdit(inv)}>
                  <Pencil className="size-3.5" />
                </Button>
                <Button variant="ghost" size="icon" className="size-7" onClick={() => onDelete(inv)}>
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            </TableCell>
          </TableRow>
        ))}
    </React.Fragment>
  );
});
