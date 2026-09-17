"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useSetManualPrice } from "@/hooks/useInvestments";
import { today } from "@/lib/dates";
import { formatNumberInput, parseNumberInput } from "@/lib/utils";
import type { HoldingPosition } from "@/types/investments";

interface ManualPriceDialogProps {
  holding: HoldingPosition | null;
  onOpenChange: (open: boolean) => void;
}

/**
 * A price for an asset no market source quotes (a local CEDEAR, a small
 * coin). It values the holding until a source answers.
 */
export function ManualPriceDialog({ holding, onOpenChange }: ManualPriceDialogProps) {
  const setPrice = useSetManualPrice();
  const [price, setPriceInput] = useState("");
  const [date, setDate] = useState(today);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!holding) return;
    setPriceInput(
      holding.current_price != null
        ? formatNumberInput(String(holding.current_price).replace(".", ","), 8)
        : "",
    );
    setDate(holding.manual_price_date ?? today());
    setError(null);
  }, [holding]);

  if (!holding) return null;


  const onSubmit = async () => {
    const value = parseNumberInput(price);
    if (!value || value <= 0) {
      setError("Ingresá un precio mayor a 0");
      return;
    }
    if (date > today()) {
      setError("La fecha no puede ser futura");
      return;
    }
    try {
      const lots = new Map(
        holding.investments.map(({ asset_name, ticker, isin }) => [
          `${asset_name}|${ticker ?? ""}|${isin ?? ""}`,
          { asset_name, ticker, isin },
        ]),
      );
      await setPrice.mutateAsync({
        lots: [...lots.values()],
        asset_type: holding.asset_type,
        currency: holding.currency,
        price: value,
        date,
      });
      onOpenChange(false);
    } catch {
      // toast handled by hook
    }
  };

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Precio manual · {holding.asset_name}</DialogTitle>
          <DialogDescription>
            Se usa mientras ninguna fuente de precios lo cotice.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="manual-price">Precio por unidad ({holding.currency})</Label>
            <Input
              id="manual-price"
              type="text"
              inputMode="decimal"
              placeholder="0,00"
              value={price}
              disabled={setPrice.isPending}
              onChange={(e) => {
                setPriceInput(formatNumberInput(e.target.value, 8));
                setError(null);
              }}
            />
            {error && <p className="text-destructive text-xs">{error}</p>}
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="manual-price-date">Fecha del precio</Label>
            <Input
              id="manual-price-date"
              type="date"
              max={today()}
              value={date}
              disabled={setPrice.isPending}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={setPrice.isPending}>
            Cancelar
          </Button>
          <Button onClick={onSubmit} disabled={setPrice.isPending || !date}>
            {setPrice.isPending ? "Guardando..." : "Guardar precio"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
