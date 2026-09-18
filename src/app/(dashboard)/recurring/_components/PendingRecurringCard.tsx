"use client";

import { useMemo } from "react";
import { CalendarClock, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { NumericCell } from "@/components/numeric-cell";
import { useCurrencyDecimals } from "@/hooks/useAccounts";
import { StateCard } from "@/components/state-card";
import { TruncatedText } from "@/components/truncated-text";
import {
  usePendingRecurring,
  useRegisterRecurringOccurrence,
} from "@/hooks/useRecurring";
import { formatDayMonth, MONTH_NAMES } from "@/lib/format";
import { uiScale } from "@/lib/ui-scale";

export function PendingRecurringCard() {
  const now = useMemo(() => new Date(), []);
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  const { data: pending, isLoading, error, refetch } = usePendingRecurring(year, month);
  const registerMutation = useRegisterRecurringOccurrence();
  const decimalsOf = useCurrencyDecimals();

  const items = pending ?? [];
  const unregistered = items.filter((p) => !p.is_registered);
  const registeredCount = items.length - unregistered.length;

  // A hint above the table: nothing while it loads or when nothing is due.
  if (isLoading) return null;
  if (!pending && error) {
    return (
      <StateCard
        variant="error"
        error={error}
        title="No se pudieron cargar los pendientes"
        onRetry={() => refetch()}
        size="compact"
      />
    );
  }
  if (items.length === 0) return null;

  const registering = registerMutation.isPending ? registerMutation.variables : undefined;

  return (
    <Card className="gap-3 py-4">
      <CardHeader className="px-4">
        <CardTitle className="flex items-center gap-2 text-sm">
          <CalendarClock className="size-3.5 text-muted-foreground" />
          Pendientes de {MONTH_NAMES[month - 1]}
        </CardTitle>
        <CardDescription className="text-xs">
          {unregistered.length === 0
            ? `Todo registrado (${registeredCount} de ${items.length}).`
            : `${unregistered.length} por registrar · ${registeredCount} registradas.`}
        </CardDescription>
      </CardHeader>
      {unregistered.length > 0 && (
        <CardContent className="flex flex-col gap-2 px-4">
          {unregistered.map((p) => {
            const isThis =
              registering?.recurring_id === p.recurring.id && registering?.date === p.expected_date;
            return (
              <div
                key={`${p.recurring.id}::${p.expected_date}`}
                className="flex items-center justify-between gap-3 rounded-md border px-3 py-2"
              >
                <div className="flex min-w-0 flex-col">
                  <TruncatedText className="text-sm font-medium">{p.recurring.description}</TruncatedText>
                  <TruncatedText className="text-xs text-muted-foreground">
                    {formatDayMonth(p.expected_date)} · {p.recurring.account_name}
                    {p.recurring.category_name ? ` · ${p.recurring.category_name}` : ""}
                  </TruncatedText>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <NumericCell
                    value={
                      p.recurring.type === "income"
                        ? Math.abs(p.recurring.amount)
                        : -Math.abs(p.recurring.amount)
                    }
                    currency={p.recurring.currency_symbol}
                    decimals={decimalsOf(p.recurring.currency)}
                    tone
                    className="text-sm"
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    className={uiScale.button}
                    disabled={registerMutation.isPending}
                    onClick={() =>
                      registerMutation.mutate({
                        recurring_id: p.recurring.id,
                        date: p.expected_date,
                      })
                    }
                  >
                    {isThis ? <Spinner className="size-3.5" /> : <Plus />}
                    Registrar
                  </Button>
                </div>
              </div>
            );
          })}
        </CardContent>
      )}
    </Card>
  );
}
