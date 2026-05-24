"use client";

import React, { useMemo, useState } from "react";
import { Trash2 } from "lucide-react";
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
  useInvestmentSales,
  useDeleteInvestmentSale,
} from "@/hooks/useInvestments";
import { formatAmount, amountTone } from "@/lib/format";
import { ASSET_TYPE_LABELS } from "@/types/investments";
import type { InvestmentSaleWithAccount, AssetType } from "@/types/investments";

export function SalesHistoryTable() {
  const { data: sales, isLoading, isError, error, refetch } = useInvestmentSales();
  const deleteMutation = useDeleteInvestmentSale();

  const [search, setSearch] = useState("");
  const [assetTypeFilter, setAssetTypeFilter] = useState<string>("all");
  const [yearFilter, setYearFilter] = useState<string>("all");
  const [deleting, setDeleting] = useState<InvestmentSaleWithAccount | null>(
    null,
  );

  const years = useMemo(() => {
    if (!sales) return [];
    const set = new Set<number>();
    for (const s of sales) {
      set.add(new Date(`${s.sale_date}T00:00:00`).getFullYear());
    }
    return Array.from(set).sort((a, b) => b - a);
  }, [sales]);

  const filtered = useMemo(() => {
    if (!sales) return [];
    const term = search.trim().toLowerCase();
    return sales.filter((s) => {
      if (assetTypeFilter !== "all" && s.asset_type !== assetTypeFilter)
        return false;
      if (
        yearFilter !== "all" &&
        new Date(`${s.sale_date}T00:00:00`).getFullYear() !== Number(yearFilter)
      )
        return false;
      if (!term) return true;
      return [s.asset_name, s.ticker ?? "", s.account_name, s.currency]
        .join(" ")
        .toLowerCase()
        .includes(term);
    });
  }, [sales, search, assetTypeFilter, yearFilter]);

  const totals = useMemo(() => {
    return filtered.reduce(
      (acc, s) => {
        acc.proceeds += s.total_proceeds_base;
        acc.fees += s.fees_base;
        acc.tax += s.tax_base;
        acc.cost += s.cost_basis_base;
        acc.pnl += s.realized_pnl_base;
        return acc;
      },
      { proceeds: 0, fees: 0, tax: 0, cost: 0, pnl: 0 },
    );
  }, [filtered]);

  const baseCurrencySymbol = filtered[0]?.base_currency
    ? (filtered[0].base_currency === "USD"
        ? "$"
        : filtered[0].base_currency === "EUR"
          ? "€"
          : filtered[0].base_currency)
    : "$";

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (isError && error) {
    return (
      <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-center">
        <p className="text-destructive font-medium">
          Error al cargar el historial de ventas
        </p>
        <p className="text-muted-foreground mt-1 text-sm">{error.message}</p>
        <Button variant="outline" size="sm" className="mt-3" onClick={() => refetch()}>
          Reintentar
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="gap-0 py-0">
          <CardHeader className="px-4 pt-4 pb-2">
            <CardDescription>Operaciones</CardDescription>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <p className="text-2xl font-bold">{filtered.length}</p>
          </CardContent>
        </Card>
        <Card className="gap-0 py-0">
          <CardHeader className="px-4 pt-4 pb-2">
            <CardDescription>Proceeds bruto</CardDescription>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <p className="text-2xl font-bold">
              {baseCurrencySymbol} {formatAmount(totals.proceeds)}
            </p>
          </CardContent>
        </Card>
        <Card className="gap-0 py-0">
          <CardHeader className="px-4 pt-4 pb-2">
            <CardDescription>Fees + Tax</CardDescription>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <p className="text-2xl font-bold">
              {baseCurrencySymbol} {formatAmount(totals.fees + totals.tax)}
            </p>
          </CardContent>
        </Card>
        <Card className="gap-0 py-0">
          <CardHeader className="px-4 pt-4 pb-2">
            <CardDescription>P&L realizado</CardDescription>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <p className={`text-2xl font-bold ${amountTone(totals.pnl)}`}>
              {baseCurrencySymbol} {formatAmount(totals.pnl)}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar activo, ticker, cuenta"
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
        <Select value={yearFilter} onValueChange={setYearFilter}>
          <SelectTrigger className="w-full sm:w-32">
            <SelectValue placeholder="Año" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            {years.map((y) => (
              <SelectItem key={y} value={String(y)}>
                {y}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Fecha</TableHead>
              <TableHead>Activo</TableHead>
              <TableHead>Ticker</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Cuenta</TableHead>
              <TableHead className="text-right">Cant.</TableHead>
              <TableHead className="text-right">Precio</TableHead>
              <TableHead className="text-right">Bruto</TableHead>
              <TableHead className="text-right">Fees</TableHead>
              <TableHead className="text-right">Tax</TableHead>
              <TableHead className="text-right">Costo</TableHead>
              <TableHead className="text-right">P&L</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={13}
                  className="h-32 text-center text-muted-foreground text-sm"
                >
                  No hay ventas registradas todavía.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="text-xs">{s.sale_date}</TableCell>
                  <TableCell className="font-medium">{s.asset_name}</TableCell>
                  <TableCell>
                    {s.ticker && <Badge variant="secondary">{s.ticker}</Badge>}
                  </TableCell>
                  <TableCell className="text-xs">
                    {ASSET_TYPE_LABELS[s.asset_type as AssetType]}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {s.account_name}
                  </TableCell>
                  <TableCell className="text-right text-xs">
                    {formatAmount(s.quantity_sold)}
                  </TableCell>
                  <TableCell className="text-right text-xs">
                    {s.currency_symbol} {formatAmount(s.price_per_unit)}
                  </TableCell>
                  <TableCell className="text-right text-xs">
                    {s.currency_symbol} {formatAmount(s.total_proceeds)}
                  </TableCell>
                  <TableCell className="text-right text-xs">
                    {formatAmount(s.fees)}
                  </TableCell>
                  <TableCell className="text-right text-xs">
                    {formatAmount(s.tax)}
                  </TableCell>
                  <TableCell className="text-right text-xs">
                    {formatAmount(s.cost_basis)}
                  </TableCell>
                  <TableCell className={`text-right text-sm font-medium ${amountTone(s.realized_pnl)}`}>
                    {formatAmount(s.realized_pnl)}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Eliminar venta"
                      onClick={() => setDeleting(s)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={!!deleting} onOpenChange={(open) => !open && setDeleting(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Eliminar venta</DialogTitle>
            <DialogDescription>
              Vas a eliminar la venta de{" "}
              <span className="font-semibold">{deleting?.asset_name}</span> del{" "}
              {deleting?.sale_date}. La app va a revertir el auto-crédito en la
              cuenta y restaurar un lote con el costo base original.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setDeleting(null)}
              disabled={deleteMutation.isPending}
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              disabled={deleteMutation.isPending}
              onClick={async () => {
                if (!deleting) return;
                try {
                  await deleteMutation.mutateAsync(deleting.id);
                  setDeleting(null);
                } catch {
                  // toast handled in hook
                }
              }}
            >
              {deleteMutation.isPending ? "Eliminando..." : "Eliminar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
