"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import { Skeleton } from "@/components/ui/skeleton";
import {
  useAccountById,
  useAccountBalanceHistory,
  useCurrencies,
} from "@/hooks/useAccounts";
import { useBaseCurrency } from "@/hooks/useTransactions";
import { formatAmount, amountTone } from "@/lib/format";
import { ACCOUNT_TYPE_LABELS } from "@/types/accounts";

const MONTH_NAMES = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
];

export function AccountDetail({ accountId }: { accountId: string }) {
  const { data: account, isLoading: loadingAccount } = useAccountById(accountId);
  const { data: history, isLoading: loadingHistory } =
    useAccountBalanceHistory(accountId);
  const { data: currencies } = useCurrencies();
  const { data: baseCurrency } = useBaseCurrency();

  if (loadingAccount || !account) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-12 w-64" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-80 w-full" />
      </div>
    );
  }

  const symbol =
    currencies?.find((c) => c.code === account.currency)?.symbol ?? account.currency;
  const baseSymbol =
    currencies?.find((c) => c.code === baseCurrency)?.symbol ?? baseCurrency ?? "$";

  const currentBalance = history?.[0];

  return (
    <>
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/accounts" aria-label="Volver">
            <ArrowLeft className="size-4" />
          </Link>
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">
              {account.name}
            </h1>
            <Badge variant="secondary">
              {ACCOUNT_TYPE_LABELS[account.account_type]}
            </Badge>
            <Badge variant="outline">{account.currency}</Badge>
            {!account.is_active && <Badge variant="outline">Inactiva</Badge>}
          </div>
          {account.notes && (
            <p className="text-muted-foreground mt-1 text-sm">{account.notes}</p>
          )}
        </div>
      </div>

      {currentBalance && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <Card className="gap-0 py-0">
            <CardHeader className="px-4 pt-4 pb-2">
              <CardDescription>Saldo actual ({account.currency})</CardDescription>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <p className="text-2xl font-bold">
                {symbol} {formatAmount(currentBalance.closing_amount)}
              </p>
            </CardContent>
          </Card>
          <Card className="gap-0 py-0">
            <CardHeader className="px-4 pt-4 pb-2">
              <CardDescription>
                Saldo actual ({baseCurrency ?? "USD"})
              </CardDescription>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <p className="text-2xl font-bold">
                {baseSymbol} {formatAmount(currentBalance.closing_base_amount)}
              </p>
            </CardContent>
          </Card>
          <Card className="gap-0 py-0">
            <CardHeader className="px-4 pt-4 pb-2">
              <CardDescription>Movimientos del mes</CardDescription>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <p
                className={`text-2xl font-bold ${amountTone(currentBalance.month_movements)}`}
              >
                {symbol} {formatAmount(currentBalance.month_movements)}
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      <div className="space-y-2">
        <h2 className="text-lg font-semibold">Historial mensual</h2>
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Mes</TableHead>
                <TableHead className="text-right">
                  Apertura ({account.currency})
                </TableHead>
                <TableHead className="text-right">Movimientos</TableHead>
                <TableHead className="text-right">
                  Cierre ({account.currency})
                </TableHead>
                <TableHead className="text-right">
                  Cierre ({baseCurrency ?? "USD"})
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loadingHistory ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-32 text-center text-muted-foreground">
                    Cargando...
                  </TableCell>
                </TableRow>
              ) : (history?.length ?? 0) === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-32 text-center text-muted-foreground text-sm">
                    Aún no hay datos para esta cuenta.
                  </TableCell>
                </TableRow>
              ) : (
                history?.map((row) => (
                  <TableRow key={`${row.year}-${row.month}`}>
                    <TableCell className="font-medium">
                      {MONTH_NAMES[row.month - 1]} {row.year}
                    </TableCell>
                    <TableCell className="text-right">
                      {symbol} {formatAmount(row.opening_amount)}
                    </TableCell>
                    <TableCell
                      className={`text-right ${amountTone(row.month_movements)}`}
                    >
                      {symbol} {formatAmount(row.month_movements)}
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {symbol} {formatAmount(row.closing_amount)}
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground text-xs">
                      {baseSymbol} {formatAmount(row.closing_base_amount)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </>
  );
}
