"use client";

import { CheckCircle2, RefreshCw } from "lucide-react";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Spinner } from "@/components/ui/spinner";
import { PageButton } from "@/components/page-button";
import { Section } from "@/components/section";
import { StateCard } from "@/components/state-card";
import { useConfirm } from "@/hooks/use-confirm";
import { useLedgerDrift, useRecalculateAllOpeningBalances } from "@/hooks/useDiagnostics";
import { MONTH_NAMES } from "@/lib/format";

const preciseAmount = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 8 });

export function LedgerDiagnosticsSection() {
  const { data: drift, isPending, error, refetch } = useLedgerDrift();
  const recalculate = useRecalculateAllOpeningBalances();
  const confirm = useConfirm();

  const handleRecalculate = async () => {
    const confirmed = await confirm({
      title: "¿Recalcular todos los saldos?",
      description:
        "Reescribe el saldo de inicio de cada mes desde el saldo inicial y los movimientos de cada cuenta. Si un saldo inicial está mal, corregilo antes en Cuentas.",
      confirmLabel: "Recalcular",
    });
    if (confirmed) recalculate.mutate();
  };

  const renderContent = () => {
    if (isPending) return <StateCard variant="loading" className="min-h-24" />;
    // A failed refresh keeps the rows on screen.
    if (!drift) {
      return <StateCard variant="error" error={error} onRetry={() => refetch()} className="min-h-24" />;
    }
    if (drift.length === 0) {
      return <StateCard variant="empty" icon={CheckCircle2} title="Sin diferencias" className="min-h-24" />;
    }
    return (
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Mes</TableHead>
              <TableHead>Cuenta</TableHead>
              <TableHead className="text-right">Guardado</TableHead>
              <TableHead className="text-right">Esperado</TableHead>
              <TableHead className="text-right">Diferencia</TableHead>
              <TableHead className="text-right">Diferencia base</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className="tabular-nums">
            {drift.map((row) => (
              <TableRow key={`${row.month_id}-${row.account_id}`}>
                <TableCell>
                  {MONTH_NAMES[row.month - 1]} {row.year}
                </TableCell>
                <TableCell>{row.account_name}</TableCell>
                <TableCell className="text-right">
                  {row.stored_opening == null ? "Falta" : preciseAmount.format(row.stored_opening)}
                </TableCell>
                <TableCell className="text-right">
                  {preciseAmount.format(row.derived_opening)}
                </TableCell>
                <TableCell className="text-right">
                  {row.stored_opening == null
                    ? "—"
                    : preciseAmount.format(row.stored_opening - row.derived_opening)}
                </TableCell>
                <TableCell className="text-right">
                  {row.stored_opening_base == null
                    ? "—"
                    : preciseAmount.format(row.stored_opening_base - row.derived_opening_base)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    );
  };

  return (
    <Section
      title="Diagnóstico de saldos"
      description="El saldo de inicio de cada mes debe ser el saldo inicial más los movimientos anteriores."
      actions={
        <PageButton
          variant="outline"
          icon={recalculate.isPending ? undefined : RefreshCw}
          onClick={() => void handleRecalculate()}
          disabled={recalculate.isPending}
        >
          {recalculate.isPending ? <Spinner className="size-3.5" /> : null}
          {recalculate.isPending ? "Recalculando…" : "Recalcular todo"}
        </PageButton>
      }
    >
      {renderContent()}
    </Section>
  );
}
