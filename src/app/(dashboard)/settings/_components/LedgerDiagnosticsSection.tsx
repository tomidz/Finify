"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useLedgerDrift, useRecalculateAllOpeningBalances } from "@/hooks/useDiagnostics";
import { errorMessage } from "@/lib/action-result";
import { MONTH_NAMES } from "@/lib/format";

const preciseAmount = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 8 });

export function LedgerDiagnosticsSection() {
  const { data: drift, isPending, error } = useLedgerDrift();
  const recalculate = useRecalculateAllOpeningBalances();
  const [confirming, setConfirming] = useState(false);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Diagnóstico de saldos</CardTitle>
        <CardDescription>
          Cada saldo de inicio de mes debe ser el saldo inicial de la cuenta más los movimientos
          de los meses anteriores.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isPending ? (
          <Skeleton className="h-16 w-full" />
        ) : error ? (
          <p className="text-destructive text-sm">{errorMessage(error)}</p>
        ) : drift.length === 0 ? (
          <p className="text-muted-foreground text-sm">Sin diferencias.</p>
        ) : (
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
            <TableBody>
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
        )}

        <Button
          variant="outline"
          onClick={() => setConfirming(true)}
          disabled={recalculate.isPending}
        >
          {recalculate.isPending ? "Recalculando..." : "Recalcular todo"}
        </Button>
      </CardContent>

      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Recalcular todos los saldos</DialogTitle>
            <DialogDescription>
              Reescribe los saldos de inicio de todos los meses a partir del saldo inicial de cada
              cuenta y sus movimientos. Si el saldo inicial de una cuenta está mal, corregilo antes
              desde Cuentas.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setConfirming(false)}>
              Cancelar
            </Button>
            <Button
              onClick={() => {
                setConfirming(false);
                recalculate.mutate();
              }}
            >
              Recalcular
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
