"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { NumericCell } from "@/components/numeric-cell";
import { PageButton } from "@/components/page-button";
import { RenderErrorBoundary } from "@/components/render-error-boundary";
import { Section } from "@/components/section";
import { StatCard, StatGrid } from "@/components/stat-card";
import { StateCard } from "@/components/state-card";
import { TruncatedText } from "@/components/truncated-text";
import {
  PageHeader,
  PageHeaderActions,
  PageHeaderDescription,
  PageHeaderTitle,
  PageHeaderTitleGroup,
} from "@/components/ui/page-header";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useEnsureCurrentMonth } from "@/hooks/useMonths";
import { useNetWorthData } from "@/hooks/useScreens";
import { useInvestmentValuation } from "@/hooks/useInvestments";
import { formatAmount, formatDayMonth } from "@/lib/format";
import { today } from "@/lib/dates";
import { buildNetWorthView } from "@/lib/finance/net-worth-view";
import { monthLabel } from "@/lib/month-grid";
import { uiScale } from "@/lib/ui-scale";
import type { NetWorthData } from "@/actions/screens";
import { NetWorthEvolutionChart } from "./_components/NetWorthEvolutionChart";
import NetWorthLoading from "./loading";

export default function NetWorthPage() {
  // null = latest year with months; the server resolves it.
  const [requestedYear, setRequestedYear] = useState<number | null>(null);

  const { data, isPending, isPlaceholderData, isFetching, error, refetch } = useNetWorthData(requestedYear);
  const ensureCurrentMonth = useEnsureCurrentMonth();
  const months = data?.months;

  useEffect(() => {
    if (!months || months.length > 0 || ensureCurrentMonth.isPending) return;
    ensureCurrentMonth.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [months]);

  const baseCurrency = data?.baseCurrency ?? null;
  const currencySymbol = useMemo(() => {
    if (!baseCurrency) return "$";
    const found = data?.currencies.find((c) => c.code === baseCurrency);
    return found?.symbol ?? baseCurrency;
  }, [baseCurrency, data?.currencies]);

  // Also while a failed read is retried.
  if (isPending || (!data && isFetching)) return <NetWorthLoading />;

  const years = data?.years ?? [];
  // While another year loads, the selector already shows the requested one.
  const shownYear = (isPlaceholderData ? requestedYear : null) ?? data?.year ?? null;
  // The close the figures shown are at (the resolved year, not the requested one).
  const closeMonth = data?.year != null && data.accounts && data.accounts.month > 0
    ? { year: data.year, month: data.accounts.month }
    : null;

  const header = (
    <PageHeader>
      <PageHeaderTitleGroup>
        <PageHeaderTitle>Patrimonio neto</PageHeaderTitle>
        <PageHeaderDescription>
          {closeMonth ? `Al cierre de ${monthLabel(closeMonth)}` : "Activos, pasivos y evolución"}
        </PageHeaderDescription>
      </PageHeaderTitleGroup>
      <PageHeaderActions>
        <Select
          value={shownYear == null ? "" : String(shownYear)}
          onValueChange={(value) => setRequestedYear(Number(value))}
          disabled={years.length === 0}
        >
          <SelectTrigger size="sm" aria-label="Año" className={`${uiScale.trigger} w-24 tabular-nums`}>
            <SelectValue placeholder="Año" />
          </SelectTrigger>
          <SelectContent>
            {years.map((year) => (
              <SelectItem key={year} value={String(year)} className="text-xs tabular-nums">
                {year}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </PageHeaderActions>
    </PageHeader>
  );

  // A failed background refetch keeps showing the last figures.
  if (!data) {
    return (
      <div className="flex flex-col gap-6">
        {header}
        <StateCard
          variant="error"
          title="No se pudo cargar el patrimonio"
          error={error}
          onRetry={() => void refetch()}
          className="min-h-72"
        />
      </div>
    );
  }

  // No year until the first month exists (see ensureCurrentMonth).
  if (data.year === null || !data.accounts || !data.liabilities || !data.evolution) {
    if ((!ensureCurrentMonth.isError && !error) || isFetching) return <NetWorthLoading />;
    return (
      <div className="flex flex-col gap-6">
        {header}
        <StateCard
          variant="error"
          title="No se pudo cargar el patrimonio"
          error={error ?? ensureCurrentMonth.error}
          onRetry={error ? () => void refetch() : () => ensureCurrentMonth.mutate()}
          className="min-h-72"
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {header}

      <div className={isPlaceholderData ? "flex flex-col gap-6 opacity-60" : "flex flex-col gap-6"}>
        <NetWorthContent
          data={data as NetWorthScreen}
          currencySymbol={currencySymbol}
          baseCurrency={baseCurrency ?? "USD"}
        />
      </div>
    </div>
  );
}

type NetWorthScreen = NetWorthData & {
  year: number;
  accounts: NonNullable<NetWorthData["accounts"]>;
  liabilities: NonNullable<NetWorthData["liabilities"]>;
  evolution: NonNullable<NetWorthData["evolution"]>;
};

function NetWorthContent({
  data,
  currencySymbol,
  baseCurrency,
}: {
  data: NetWorthScreen;
  currencySymbol: string;
  baseCurrency: string;
}) {
  const { accounts: assetsSummary, liabilities, evolution } = data;
  const todayStr = today();
  // Market values only exist for today: a past close keeps investments at
  // cost, and until they arrive the current month does too.
  const closesToday = assetsSummary.close_date === todayStr;
  const { data: valuation } = useInvestmentValuation({ enabled: closesToday });

  const view = useMemo(
    () =>
      buildNetWorthView({
        accounts: assetsSummary,
        liabilities,
        evolution,
        valuation,
        today: todayStr,
      }),
    [assetsSummary, liabilities, evolution, valuation, todayStr],
  );
  const { totalAssets, totalLiabilities, netWorth, groups } = view;

  const fxNote = [
    view.fxMissing ? "montos sin cotización fuera de los totales" : null,
    view.cashAtBookValue ? "saldos sin cotización a su valor de carga" : null,
    view.fxRateDate ? `TC del ${formatDayMonth(view.fxRateDate)}` : null,
    Math.round(view.fxRevaluation * 100) !== 0
      ? `incluye diferencia de cambio de ${currencySymbol} ${formatAmount(view.fxRevaluation)}`
      : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const atCost = !view.marketValued && view.accounts.some((account) => account.investment_value !== 0);
  const pendingHint = !atCost ? undefined : "Inversiones a costo";

  return (
    <>
      <RenderErrorBoundary name="net-worth-summary" resetKeys={[view]} className="min-h-24">
        <div className="flex flex-col gap-1.5">
          <StatGrid columns={3}>
            <StatCard label="Total activos" value={totalAssets} currency={currencySymbol} sub={pendingHint} />
            <StatCard label="Total pasivos" value={totalLiabilities} currency={currencySymbol} />
            <StatCard
              label="Patrimonio neto"
              value={netWorth}
              currency={currencySymbol}
              signTone
              sub={pendingHint}
            />
          </StatGrid>
          {fxNote && <p className="text-muted-foreground text-[11px]">{fxNote}</p>}
        </div>
      </RenderErrorBoundary>

      <NetWorthEvolutionChart data={view.evolution} currencySymbol={currencySymbol} />

      <div className="grid gap-6 lg:grid-cols-2">
        <RenderErrorBoundary name="net-worth-assets" resetKeys={[groups]} className="min-h-40">
          <Section title="Activos">
            {groups.length === 0 ? (
              <StateCard variant="empty" title="No hay cuentas" className="min-h-24" />
            ) : (
              groups.map((group) => (
                <div key={group.type} className="overflow-hidden rounded-lg border">
                  <div className="bg-muted/40 flex items-center justify-between gap-3 border-b px-3 py-2 text-xs">
                    <span className="font-semibold">{group.label}</span>
                    <NumericCell value={group.total} currency={currencySymbol} className="text-muted-foreground" />
                  </div>
                  {group.accounts.map((acc) => {
                    const inBase = (value: number | null) =>
                      value !== null ? `${currencySymbol} ${formatAmount(value)}` : "sin cotización";
                    const hasCash = Math.abs(acc.balance_base) > 0.01;
                    const hasInvestments = acc.investment_value_base === null || acc.investment_value_base > 0;
                    const showInvestmentBreakdown = hasCash && hasInvestments;
                    const withoutRate = acc.balance_fx_missing || acc.investment_value_base === null;
                    return (
                      <div key={acc.id} className="flex items-center justify-between gap-3 border-b px-3 py-2 text-xs last:border-b-0">
                        <div className="flex min-w-0 flex-col">
                          <div className="flex min-w-0 items-baseline gap-1">
                            <TruncatedText className="font-medium">{acc.name}</TruncatedText>
                            {!acc.is_active && <span className="text-muted-foreground shrink-0 text-[11px]">(inactiva)</span>}
                          </div>
                          {showInvestmentBreakdown && (
                            <span className="text-muted-foreground text-[11px]">
                              cash: {inBase(acc.balance_base)} · inv: {inBase(acc.investment_value_base)}
                            </span>
                          )}
                        </div>
                        <div className="flex shrink-0 items-baseline gap-2">
                          <NumericCell value={acc.total} currency={currencySymbol} className="font-medium" />
                          {withoutRate && !showInvestmentBreakdown && (
                            <span className="text-muted-foreground text-[11px]">sin cotización</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))
            )}
          </Section>
        </RenderErrorBoundary>

        <RenderErrorBoundary name="net-worth-liabilities" resetKeys={[liabilities]} className="min-h-40">
          <Section
            title="Pasivos"
            actions={
              <PageButton variant="outline" icon={ExternalLink} asChild>
                <Link href="/debts">Gestionar deudas</Link>
              </PageButton>
            }
          >
            {liabilities.items.length === 0 ? (
              <StateCard variant="empty" title="No hay pasivos registrados" className="min-h-24" />
            ) : (
              <div className="overflow-hidden rounded-lg border">
                <div className="bg-muted/40 flex items-center justify-between gap-3 border-b px-3 py-2 text-xs">
                  <span className="font-semibold">Deudas</span>
                  <NumericCell value={liabilities.total} currency={currencySymbol} className="text-muted-foreground" />
                </div>
                {liabilities.items.map((item) => (
                  <div key={item.item_id} className="flex items-center justify-between gap-3 border-b px-3 py-2 text-xs last:border-b-0">
                    <TruncatedText className="font-medium">{item.name}</TruncatedText>
                    <div className="flex shrink-0 items-baseline gap-2">
                      <NumericCell value={item.amount} currency={item.currency_symbol} className="font-medium" />
                      {item.amount_base !== null && item.currency !== baseCurrency && (
                        <span className="text-muted-foreground text-[11px] tabular-nums">
                          ≈ {currencySymbol} {formatAmount(item.amount_base)}
                        </span>
                      )}
                      {item.amount_base === null && item.amount !== 0 && (
                        <span className="text-muted-foreground text-[11px]">sin cotización</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Section>
        </RenderErrorBoundary>
      </div>
    </>
  );
}
