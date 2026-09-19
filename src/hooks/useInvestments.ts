"use client";

import { useCallback, useRef } from "react";
import {
  useQuery,
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import {
  adjustInvestmentPosition,
  getInvestments,
  getInvestmentSales,
  createInvestment,
  updateInvestment,
  deleteInvestment,
  deleteInvestmentSale,
  fetchCurrentPrices,
  lookupInvestmentInstrument,
  sellInvestment,
  setManualPrice,
  swapInvestment,
  transferInvestmentPosition,
} from "@/actions/investments";
import type {
  AdjustInvestmentPositionInput,
  CreateInvestmentInput,
  ManualPriceInput,
  SwapInvestmentInput,
  SellInvestmentInput,
  TransferInvestmentPositionInput,
  UpdateInvestmentInput,
} from "@/lib/validations/investment.schema";
import type { PriceRequest } from "@/lib/asset-classes";
import type { InvestmentValuation } from "@/lib/server/investment-valuation";
import type { InvestmentWithAccount } from "@/types/investments";
import { invalidateLedger } from "@/lib/query-keys";
import { toast } from "sonner";
import { ActionError, errorMessage, unwrapResult } from "@/lib/action-result";

export const INVESTMENT_KEYS = {
  all: ["investments"] as const,
  sales: ["investments", "sales"] as const,
  valuationAll: ["investments", "valuation"] as const,
  valuation: ["investments", "valuation", "current"] as const,
  prices: (baseCurrency: string, tickersKey: string) =>
    ["investments", "prices", baseCurrency, tickersKey] as const,
};

// Positions feed the ledger (purchases and sales are movements) and the
// valuation. Quotes are keyed by ticker and stay cached.
function invalidateInvestmentWrite(queryClient: ReturnType<typeof useQueryClient>) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: INVESTMENT_KEYS.all, exact: true }),
    queryClient.invalidateQueries({ queryKey: INVESTMENT_KEYS.sales }),
    queryClient.invalidateQueries({ queryKey: INVESTMENT_KEYS.valuationAll }),
    invalidateLedger(queryClient),
  ]);
}

export function useInvestments() {
  return useQuery({
    queryKey: INVESTMENT_KEYS.all,
    queryFn: async () => unwrapResult(await getInvestments()),
    staleTime: 5 * 60_000,
    gcTime: 15 * 60_000,
  });
}

export function useSuspenseInvestments() {
  return useSuspenseQuery({
    queryKey: INVESTMENT_KEYS.all,
    queryFn: async () => unwrapResult(await getInvestments()),
    staleTime: 5 * 60_000,
    gcTime: 15 * 60_000,
  });
}

async function fetchInvestmentValuation(): Promise<InvestmentValuation> {
  const response = await fetch("/api/investments/valuation", { cache: "no-store" });
  const body = await response.json().catch(() => null);
  if (!response.ok || !body) {
    throw new ActionError(body?.error ?? "Error al obtener valor actual de inversiones");
  }
  return body as InvestmentValuation;
}

/**
 * Today's market value vs cost per account. Fetched from a route handler (not
 * a server action) so the price lookups it waits on never block the page's
 * other reads.
 */
export function useInvestmentValuation({ enabled = true }: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: INVESTMENT_KEYS.valuation,
    enabled,
    queryFn: () => fetchInvestmentValuation(),
    staleTime: 60_000,
    gcTime: 10 * 60_000,
  });
}

export function useCurrentInvestmentValuesByAccount() {
  const query = useInvestmentValuation();
  return { ...query, data: query.data?.byAccount };
}

export function useLookupInvestmentInstrument() {
  return useMutation({
    mutationFn: async (input: { ticker?: string | null; isin?: string | null; asset_type?: string | null }) =>
      unwrapResult(await lookupInvestmentInstrument(input)),
    onError: (err: Error) => {
      toast.error(errorMessage(err));
    },
  });
}

export function useCreateInvestment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateInvestmentInput) => unwrapResult(await createInvestment(input)),
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: INVESTMENT_KEYS.all });
      const previous = queryClient.getQueryData<InvestmentWithAccount[]>(
        INVESTMENT_KEYS.all,
      );

      queryClient.setQueryData<InvestmentWithAccount[]>(INVESTMENT_KEYS.all, (old) => [
        {
          id: `temp-${Date.now()}`,
          user_id: "",
          account_id: input.account_id,
          asset_name: input.asset_name,
          ticker: input.ticker ?? null,
          isin: input.isin ?? null,
          asset_type: input.asset_type,
          quantity: input.quantity,
          price_per_unit: input.price_per_unit,
          total_cost: input.total_cost,
          currency: input.currency,
          purchase_date: input.purchase_date,
          notes: input.notes ?? null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          account_name: "Guardando...",
          account_type: "",
          currency_symbol: input.currency,
        },
        ...(old ?? []),
      ]);

      return { previous };
    },
    onError: (err: Error, _input, context) => {
      if (context?.previous) {
        queryClient.setQueryData(INVESTMENT_KEYS.all, context.previous);
      }
      toast.error(errorMessage(err));
    },
    onSuccess: () => {
      toast.success("Inversión registrada");
    },
    onSettled: () => {
      invalidateInvestmentWrite(queryClient);
    },
  });
}

export function useUpdateInvestment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: UpdateInvestmentInput) => unwrapResult(await updateInvestment(input)),
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: INVESTMENT_KEYS.all });
      const previous = queryClient.getQueryData<InvestmentWithAccount[]>(
        INVESTMENT_KEYS.all,
      );
      queryClient.setQueryData<InvestmentWithAccount[]>(
        INVESTMENT_KEYS.all,
        (old) =>
          (old ?? []).map((investment) =>
            investment.id === input.id
              ? { ...investment, ...input, updated_at: new Date().toISOString() }
              : investment,
          ),
      );
      return { previous };
    },
    onError: (err: Error, _input, context) => {
      if (context?.previous) {
        queryClient.setQueryData(INVESTMENT_KEYS.all, context.previous);
      }
      toast.error(errorMessage(err));
    },
    onSuccess: () => {
      toast.success("Inversión actualizada");
    },
    onSettled: () => {
      invalidateInvestmentWrite(queryClient);
    },
  });
}

export function useDeleteInvestment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => unwrapResult(await deleteInvestment(id)),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: INVESTMENT_KEYS.all });
      const previous = queryClient.getQueryData<InvestmentWithAccount[]>(
        INVESTMENT_KEYS.all
      );
      queryClient.setQueryData<InvestmentWithAccount[]>(
        INVESTMENT_KEYS.all,
        (old) => (old ?? []).filter((inv) => inv.id !== id)
      );
      return { previous };
    },
    onError: (_err, _id, context) => {
      if (context?.previous) {
        queryClient.setQueryData(INVESTMENT_KEYS.all, context.previous);
      }
      toast.error(errorMessage(_err));
    },
    onSuccess: () => {
      toast.success("Inversión eliminada");
    },
    onSettled: () => {
      invalidateInvestmentWrite(queryClient);
    },
  });
}

export function useInvestmentSales() {
  return useQuery({
    queryKey: INVESTMENT_KEYS.sales,
    queryFn: async () => unwrapResult(await getInvestmentSales()),
    staleTime: 5 * 60_000,
    gcTime: 15 * 60_000,
  });
}

export function useDeleteInvestmentSale() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (saleId: string) => unwrapResult(await deleteInvestmentSale(saleId)),
    onError: (err: Error) => toast.error(errorMessage(err)),
    onSuccess: () => toast.success("Venta eliminada"),
    onSettled: () => {
      invalidateInvestmentWrite(queryClient);
    },
  });
}

export function useSellInvestment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: SellInvestmentInput) => unwrapResult(await sellInvestment(input)),
    onError: (err: Error) => {
      toast.error(errorMessage(err));
    },
    onSuccess: () => {
      toast.success("Venta registrada");
    },
    onSettled: () => {
      invalidateInvestmentWrite(queryClient);
    },
  });
}

export function useAdjustInvestmentPosition() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: AdjustInvestmentPositionInput) =>
      unwrapResult(await adjustInvestmentPosition(input)),
    onError: (err: Error) => {
      toast.error(errorMessage(err));
    },
    onSuccess: () => {
      toast.success("Posición ajustada");
    },
    onSettled: () => {
      invalidateInvestmentWrite(queryClient);
    },
  });
}

export function useTransferInvestmentPosition() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: TransferInvestmentPositionInput) =>
      unwrapResult(await transferInvestmentPosition(input)),
    onError: (err: Error) => {
      toast.error(errorMessage(err));
    },
    onSuccess: () => {
      toast.success("Posicion transferida");
    },
    onSettled: () => {
      invalidateInvestmentWrite(queryClient);
    },
  });
}

export function useSwapInvestment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: SwapInvestmentInput) => unwrapResult(await swapInvestment(input)),
    onError: (err: Error) => {
      toast.error(errorMessage(err));
    },
    onSuccess: () => {
      toast.success("Intercambio registrado");
    },
    onSettled: () => {
      invalidateInvestmentWrite(queryClient);
    },
  });
}

export function useSetManualPrice() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: ManualPriceInput) => unwrapResult(await setManualPrice(input)),
    onError: (err: Error) => {
      toast.error(errorMessage(err));
    },
    onSuccess: () => {
      toast.success("Precio guardado");
    },
    onSettled: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ["investments", "prices"] }),
        queryClient.invalidateQueries({ queryKey: INVESTMENT_KEYS.valuationAll }),
      ]),
  });
}

export function useCurrentPrices(
  tickers: PriceRequest[],
  baseCurrency: string
) {
  const queryClient = useQueryClient();
  const tickerKeys = tickers.map((t) => t.key).sort();
  const tickersKey = tickerKeys.join("|");
  // Set by refresh(): the next fetch bypasses the server-side price cache.
  const freshRef = useRef(false);
  const query = useQuery({
    queryKey: INVESTMENT_KEYS.prices(baseCurrency, tickersKey),
    enabled: tickers.length > 0 && !!baseCurrency,
    // Matches the server-side price cache TTL.
    staleTime: 15 * 60_000,
    gcTime: 20 * 60_000,
    queryFn: async () => {
      const fresh = freshRef.current;
      freshRef.current = false;
      return unwrapResult(await fetchCurrentPrices(tickers, baseCurrency, fresh));
    },
  });
  const { refetch } = query;
  const refresh = useCallback(async () => {
    freshRef.current = true;
    const result = await refetch();
    queryClient.invalidateQueries({ queryKey: INVESTMENT_KEYS.valuationAll });
    return result;
  }, [refetch, queryClient]);
  return { ...query, refresh };
}
