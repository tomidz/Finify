"use client";

import React from "react";
import {
  ArrowLeftRight,
  ChevronDown,
  ChevronRight,
  Pencil,
  Repeat,
  SlidersHorizontal,
  Tag,
  Trash2,
  TrendingDown,
} from "lucide-react";
import { NumericCell } from "@/components/numeric-cell";
import { RowActions, type RowAction } from "@/components/row-actions";
import { TruncatedText } from "@/components/truncated-text";
import { Badge } from "@/components/ui/badge";
import { TableCell, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { isCashLike } from "@/lib/asset-classes";
import { amountTone, formatAmount, formatDayMonth } from "@/lib/format";
import type { UnpricedReason } from "@/lib/server/prices";
import { cn } from "@/lib/utils";
import { ASSET_TYPE_LABELS, holdingGroupKey } from "@/types/investments";
import type { HoldingPosition, InvestmentWithAccount } from "@/types/investments";
import { quantityDecimals, unitPriceDecimals, unpricedReasonText } from "./investment-format";

export const HoldingRows = React.memo(function HoldingRows({
  holding,
  isExpanded,
  unpricedReason,
  onToggleExpanded,
  onTransfer,
  onSell,
  onAdjust,
  onSetPrice,
  onSwap,
  onEdit,
  onDelete,
}: {
  holding: HoldingPosition;
  isExpanded: boolean;
  /** Why the holding has no price, when the price lookup said. */
  unpricedReason: UnpricedReason | undefined;
  onToggleExpanded: (key: string) => void;
  onTransfer: (holding: HoldingPosition) => void;
  onSell: (holding: HoldingPosition) => void;
  onAdjust: (holding: HoldingPosition) => void;
  onSetPrice: (holding: HoldingPosition) => void;
  onSwap: (holding: HoldingPosition) => void;
  onEdit: (investment: InvestmentWithAccount) => void;
  onDelete: (investment: InvestmentWithAccount) => void;
}) {
  const holdingKey = holdingGroupKey(holding);
  const lots = holding.investments as InvestmentWithAccount[];
  const singleLot = lots.length === 1 ? lots[0] : null;
  const isMulti = !singleLot;
  const cashLike = isCashLike(holding.asset_type);
  const sym = holding.currency_symbol;

  const actions: RowAction[] = [
    { label: "Vender", icon: TrendingDown, onSelect: () => onSell(holding) },
    { label: "Intercambiar", icon: Repeat, onSelect: () => onSwap(holding) },
    { label: "Ajustar", icon: SlidersHorizontal, onSelect: () => onAdjust(holding) },
    { label: "Precio manual", icon: Tag, onSelect: () => onSetPrice(holding), hidden: cashLike },
    { label: "Transferir", icon: ArrowLeftRight, onSelect: () => onTransfer(holding) },
    {
      label: "Editar",
      icon: Pencil,
      onSelect: () => singleLot && onEdit(singleLot),
      hidden: !singleLot,
    },
    {
      label: "Borrar",
      icon: Trash2,
      onSelect: () => singleLot && onDelete(singleLot),
      destructive: true,
      hidden: !singleLot,
    },
  ];

  return (
    <>
      <TableRow
        className={isMulti ? "cursor-pointer" : undefined}
        onClick={isMulti ? () => onToggleExpanded(holdingKey) : undefined}
      >
        <TableCell className="font-medium">
          <div className="flex min-w-0 items-center gap-1">
            {!isMulti ? null : (
              <button
                type="button"
                aria-label={isExpanded ? "Ocultar compras" : "Ver compras"}
                aria-expanded={isExpanded}
                onClick={(event) => {
                  event.stopPropagation();
                  onToggleExpanded(holdingKey);
                }}
                className="text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 -ml-1 rounded-sm p-0.5 outline-none focus-visible:ring-2"
              >
                {isExpanded ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
              </button>
            )}
            <TruncatedText className="max-w-56">{holding.asset_name}</TruncatedText>
            {!isMulti ? null : (
              <span className="text-muted-foreground shrink-0 text-[11px] font-normal">
                {lots.length} compras
              </span>
            )}
          </div>
        </TableCell>
        <TableCell>{!lots[0]?.ticker ? null : <Badge variant="secondary">{lots[0].ticker}</Badge>}</TableCell>
        <TableCell className="text-xs">{ASSET_TYPE_LABELS[holding.asset_type]}</TableCell>
        <TableCell className="text-muted-foreground text-xs">
          <TruncatedText className="max-w-40">{holding.account_name}</TruncatedText>
        </TableCell>
        <TableCell>
          <NumericCell
            value={holding.total_quantity}
            decimals={quantityDecimals(holding.total_quantity, holding.asset_type)}
          />
        </TableCell>
        <TableCell>
          <NumericCell
            value={holding.avg_cost_per_unit}
            currency={sym}
            decimals={unitPriceDecimals(holding.avg_cost_per_unit)}
          />
        </TableCell>
        <TableCell>
          <NumericCell value={holding.total_cost} currency={sym} />
        </TableCell>
        <TableCell>
          {holding.current_price !== null ? (
            <NumericCell
              value={holding.current_price}
              currency={sym}
              decimals={unitPriceDecimals(holding.current_price)}
            />
          ) : !unpricedReason ? (
            <NumericCell value={null} />
          ) : (
            <Tooltip>
              <TooltipTrigger asChild>
                <span
                  tabIndex={0}
                  className="text-muted-foreground block cursor-default text-right underline decoration-dotted underline-offset-2 outline-none"
                >
                  —
                </span>
              </TooltipTrigger>
              <TooltipContent>{unpricedReasonText(unpricedReason)}</TooltipContent>
            </Tooltip>
          )}
          {!holding.manual_price_date ? null : (
            <div className="text-muted-foreground text-right text-[11px] whitespace-nowrap">
              manual del {formatDayMonth(holding.manual_price_date)}
            </div>
          )}
        </TableCell>
        <TableCell>
          <NumericCell value={holding.current_value} currency={sym} />
        </TableCell>
        <TableCell>
          {cashLike ? (
            <span className="text-muted-foreground block text-right text-xs">Efectivo</span>
          ) : (
            <div className="flex items-baseline justify-end gap-1">
              <NumericCell value={holding.gain_loss} tone />
              {holding.gain_loss === null || holding.gain_loss_pct === null ? null : (
                <span className={cn("text-[11px] tabular-nums", amountTone(holding.gain_loss))}>
                  ({formatAmount(holding.gain_loss_pct)}%)
                </span>
              )}
            </div>
          )}
        </TableCell>
        <TableCell className="text-right">
          <RowActions actions={actions} />
        </TableCell>
      </TableRow>
      {!isMulti || !isExpanded
        ? null
        : lots.map((lot) => (
            <TableRow key={lot.id} className="bg-muted/30 hover:bg-muted/30">
              <TableCell className="text-muted-foreground pl-8 text-xs tabular-nums">{lot.purchase_date}</TableCell>
              <TableCell colSpan={3} />
              <TableCell className="text-xs">
                <NumericCell value={lot.quantity} decimals={quantityDecimals(lot.quantity, lot.asset_type)} />
              </TableCell>
              <TableCell className="text-xs">
                <NumericCell
                  value={lot.price_per_unit}
                  currency={lot.currency_symbol}
                  decimals={unitPriceDecimals(lot.price_per_unit)}
                />
              </TableCell>
              <TableCell className="text-xs">
                <NumericCell value={lot.total_cost} currency={lot.currency_symbol} />
              </TableCell>
              <TableCell colSpan={3} />
              <TableCell className="text-right">
                <RowActions
                  actions={[
                    { label: "Editar compra", icon: Pencil, onSelect: () => onEdit(lot) },
                    { label: "Borrar compra", icon: Trash2, onSelect: () => onDelete(lot), destructive: true },
                  ]}
                />
              </TableCell>
            </TableRow>
          ))}
    </>
  );
});
