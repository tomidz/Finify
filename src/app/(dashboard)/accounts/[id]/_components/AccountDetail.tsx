"use client";

import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  PageHeader,
  PageHeaderDescription,
  PageHeaderTitle,
  PageHeaderTitleGroup,
} from "@/components/ui/page-header";
import { NumericCell } from "@/components/numeric-cell";
import { Section } from "@/components/section";
import { StatCard, StatGrid } from "@/components/stat-card";
import { StateCard } from "@/components/state-card";
import {
  useAccountById,
  useAccountBalanceHistory,
  useCurrencies,
} from "@/hooks/useAccounts";
import { useBaseCurrency } from "@/hooks/useTransactions";
import { formatAmount, MONTH_NAMES } from "@/lib/format";
import { ACCOUNT_TYPE_LABELS } from "@/types/accounts";

const CRUMBS = [{ label: "Cuentas", href: "/accounts" }];

export function AccountDetail({ accountId }: { accountId: string }) {
  const {
    data: account,
    isLoading: loadingAccount,
    error: accountError,
    refetch: refetchAccount,
  } = useAccountById(accountId);
  const {
    data: history,
    isLoading: loadingHistory,
    error: historyError,
    refetch: refetchHistory,
  } = useAccountBalanceHistory(accountId);
  const { data: currencies } = useCurrencies();
  const { data: baseCurrency } = useBaseCurrency();

  if (!account) {
    return (
      <>
        <PageHeader>
          <PageHeaderTitleGroup>
            <PageHeaderTitle breadcrumb={CRUMBS}>Cuenta</PageHeaderTitle>
          </PageHeaderTitleGroup>
        </PageHeader>
        {loadingAccount || !accountError ? (
          <StateCard variant="loading" className="min-h-80" />
        ) : (
          <StateCard
            variant="error"
            error={accountError}
            onRetry={() => refetchAccount()}
            className="min-h-80"
          />
        )}
      </>
    );
  }

  const currency = currencies?.find((c) => c.code === account.currency);
  const symbol = currency?.symbol ?? account.currency;
  const decimals = currency?.decimals ?? 2;
  const base = currencies?.find((c) => c.code === baseCurrency);
  // Unknown until the base currency loads: no label or symbol is guessed.
  const baseSymbol = base?.symbol ?? baseCurrency;
  const baseDecimals = base?.decimals ?? 2;
  const baseLabel = baseCurrency ?? "base";

  const currentBalance = history?.[0];

  const renderHistory = () => {
    if (loadingHistory) return <StateCard variant="loading" className="min-h-64" />;
    if (!history && historyError) {
      return (
        <StateCard
          variant="error"
          error={historyError}
          onRetry={() => refetchHistory()}
          className="min-h-64"
        />
      );
    }
    if (!history || history.length === 0) {
      return (
        <StateCard
          variant="empty"
          title="Sin historial"
          description="Aún no hay meses con datos para esta cuenta."
          className="min-h-64"
        />
      );
    }
    return (
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Mes</TableHead>
              <TableHead className="text-right">Apertura ({account.currency})</TableHead>
              <TableHead className="text-right">Movimientos</TableHead>
              <TableHead className="text-right">Cierre ({account.currency})</TableHead>
              <TableHead className="text-right">Cierre ({baseLabel})</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {history.map((row) => (
              <TableRow key={`${row.year}-${row.month}`}>
                <TableCell className="font-medium">
                  {MONTH_NAMES[row.month - 1]} {row.year}
                </TableCell>
                <TableCell>
                  <NumericCell value={row.opening_amount} currency={symbol} decimals={decimals} />
                </TableCell>
                <TableCell>
                  <NumericCell value={row.month_movements} currency={symbol} decimals={decimals} tone />
                </TableCell>
                <TableCell>
                  <NumericCell
                    value={row.closing_amount}
                    currency={symbol}
                    decimals={decimals}
                    className="font-medium"
                  />
                </TableCell>
                <TableCell className="text-right text-xs text-muted-foreground">
                  <NumericCell
                    value={row.closing_base_amount}
                    currency={baseSymbol}
                    decimals={baseDecimals}
                    className="inline"
                  />
                  {row.closing_rate_missing && " (sin cotización)"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    );
  };

  return (
    <>
      <PageHeader>
        <PageHeaderTitleGroup>
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <PageHeaderTitle breadcrumb={CRUMBS}>{account.name}</PageHeaderTitle>
            <Badge variant="secondary">{ACCOUNT_TYPE_LABELS[account.account_type]}</Badge>
            <Badge variant="outline">{account.currency}</Badge>
            {!account.is_active && <Badge variant="outline">Inactiva</Badge>}
          </div>
          {account.notes && <PageHeaderDescription>{account.notes}</PageHeaderDescription>}
        </PageHeaderTitleGroup>
      </PageHeader>

      {!(loadingHistory || currentBalance) ? null : (
        <StatGrid columns={3}>
          <StatCard
            label={`Saldo (${account.currency})`}
            value={currentBalance?.closing_amount}
            currency={symbol}
            format={(value) => formatAmount(value, decimals)}
            loading={loadingHistory}
          />
          <StatCard
            label={`Saldo (${baseLabel})`}
            value={currentBalance?.closing_base_amount}
            currency={baseSymbol}
            format={(value) => formatAmount(value, baseDecimals)}
            suffix={
              !currentBalance?.closing_rate_missing ? undefined : (
                <span className="font-normal text-muted-foreground">sin cotización</span>
              )
            }
            loading={loadingHistory}
          />
          <StatCard
            label="Movimientos del mes"
            value={currentBalance?.month_movements}
            currency={symbol}
            format={(value) => formatAmount(value, decimals)}
            signTone
            loading={loadingHistory}
          />
        </StatGrid>
      )}

      <Section title="Historial mensual">{renderHistory()}</Section>
    </>
  );
}
