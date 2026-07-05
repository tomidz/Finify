"use client";

import { useMemo } from "react";
import { CalendarClock, Check, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  usePendingRecurring,
  useRegisterRecurringOccurrence,
} from "@/hooks/useRecurring";
import { formatAmount, MONTH_NAMES } from "@/lib/format";

export function PendingRecurringCard() {
  const now = useMemo(() => new Date(), []);
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  const { data: pending, isLoading } = usePendingRecurring(year, month);
  const registerMutation = useRegisterRecurringOccurrence();

  const items = pending ?? [];
  const unregistered = items.filter((p) => !p.is_registered);
  const registeredCount = items.length - unregistered.length;

  if (isLoading || items.length === 0) return null;

  return (
    <Card className="gap-0 py-0">
      <CardHeader className="px-4 pt-4 pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <CalendarClock className="size-4" />
          Pendientes de {MONTH_NAMES[month - 1]}
        </CardTitle>
        <CardDescription>
          {unregistered.length === 0
            ? `Todo registrado (${registeredCount} de ${items.length}).`
            : `${unregistered.length} por registrar · ${registeredCount} ya registradas.`}
        </CardDescription>
      </CardHeader>
      {unregistered.length > 0 && (
        <CardContent className="space-y-2 px-4 pb-4">
          {unregistered.map((p) => (
            <div
              key={`${p.recurring.id}::${p.expected_date}`}
              className="flex items-center justify-between gap-3 rounded-md border px-3 py-2"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">
                  {p.recurring.description}
                </p>
                <p className="text-muted-foreground text-xs">
                  {p.expected_date.slice(8, 10)}/{p.expected_date.slice(5, 7)} ·{" "}
                  {p.recurring.account_name}
                  {p.recurring.category_name
                    ? ` · ${p.recurring.category_name}`
                    : ""}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Badge
                  variant="secondary"
                  className={
                    p.recurring.type === "income"
                      ? "bg-green-100 text-green-800"
                      : "bg-red-100 text-red-800"
                  }
                >
                  {p.recurring.currency_symbol}{" "}
                  {formatAmount(Math.abs(p.recurring.amount))}
                </Badge>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={registerMutation.isPending}
                  onClick={() =>
                    registerMutation.mutate({
                      recurring_id: p.recurring.id,
                      date: p.expected_date,
                    })
                  }
                >
                  {registerMutation.isPending ? (
                    "Registrando..."
                  ) : (
                    <>
                      <Plus className="mr-1 size-3.5" />
                      Registrar
                    </>
                  )}
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      )}
      {unregistered.length === 0 && (
        <CardContent className="px-4 pb-4">
          <p className="text-muted-foreground flex items-center gap-1 text-sm">
            <Check className="size-4 text-green-600" /> Nada pendiente este mes.
          </p>
        </CardContent>
      )}
    </Card>
  );
}
