"use client";

import {
  useQuery,
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import {
  getInvestments,
  getInvestmentSales,
  createInvestment,
  updateInvestment,
  deleteInvestment,
  deleteInvestmentSale,
  fetchCurrentPrices,
  getCurrentInvestmentValuesByAccount,
  getCurrentInvestmentValuesByMonth,
  lookupInvestmentInstrument,
  sellInvestment,
  transferInvestmentPosition,
} from "@/actions/investments";
import type {
  CreateInvestmentInput,
  SellInvestmentInput,
  TransferInvestmentPositionInput,
  UpdateInvestmentInput,
} from "@/lib/validations/investment.schema";
import type { InvestmentWithAccount } from "@/types/investments";
import { toast } from "sonner";

export const INVESTMENT_KEYS = {
  all: ["investments"] as const,
  sales: ["investments", "sales"] as const,
  currentValuesByAccount: ["investments", "current-values-by-account"] as const,
  currentValuesByMonth: (year: number) => ["investments", "current-values-by-month", year] as const,
  prices: (baseCurrency: string, tickersKey: string) =>
    ["investments", "prices", baseCurrency, tickersKey] as const,
};

export function useInvestments() {
  return useQuery({
    queryKey: INVESTMENT_KEYS.all,
    queryFn: async () => {
      const result = await getInvestments();
      if ("error" in result) throw new Error(result.error);
      return result.data;
    },
    staleTime: 5 * 60_000,
    gcTime: 15 * 60_000,
  });
}

export function useSuspenseInvestments() {
  return useSuspenseQuery({
    queryKey: INVESTMENT_KEYS.all,
    queryFn: async () => {
      const result = await getInvestments();
      if ("error" in result) throw new Error(result.error);
      return result.data;
    },
    staleTime: 5 * 60_000,
    gcTime: 15 * 60_000,
  });
}

export function useCurrentInvestmentValuesByAccount() {
  return useQuery({
    queryKey: INVESTMENT_KEYS.currentValuesByAccount,
    queryFn: async () => {
      const result = await getCurrentInvestmentValuesByAccount();
      if ("error" in result) throw new Error(result.error);
      return result.data;
    },
    staleTime: 60_000,
    gcTime: 10 * 60_000,
  });
}

export function useCurrentInvestmentValuesByMonth(year: number) {
  return useQuery({
    queryKey: INVESTMENT_KEYS.currentValuesByMonth(year),
    enabled: year > 0,
    queryFn: async () => {
      const result = await getCurrentInvestmentValuesByMonth(year);
      if ("error" in result) throw new Error(result.error);
      return result.data;
    },
    staleTime: 60_000,
    gcTime: 10 * 60_000,
  });
}

export function useLookupInvestmentInstrument() {
  return useMutation({
    mutationFn: async (input: { ticker?: string | null; isin?: string | null }) => {
      const result = await lookupInvestmentInstrument(input);
      if ("error" in result) throw new Error(result.error);
      return result.data;
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });
}

export function useCreateInvestment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateInvestmentInput) => {
      const result = await createInvestment(input);
      if ("error" in result) throw new Error(result.error);
      return result.data;
    },
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
      toast.error(err.message);
    },
    onSuccess: () => {
      toast.success("Inversión registrada");
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: INVESTMENT_KEYS.all });
      queryClient.invalidateQueries({ queryKey: INVESTMENT_KEYS.currentValuesByAccount });
      queryClient.invalidateQueries({ queryKey: ["investments", "current-values-by-month"] });
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      queryClient.invalidateQueries({ queryKey: ["net-worth"] });
    },
  });
}

export function useUpdateInvestment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: UpdateInvestmentInput) => {
      const result = await updateInvestment(input);
      if ("error" in result) throw new Error(result.error);
      return result.data;
    },
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
      toast.error(err.message);
    },
    onSuccess: () => {
      toast.success("Inversión actualizada");
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: INVESTMENT_KEYS.all });
      queryClient.invalidateQueries({ queryKey: INVESTMENT_KEYS.currentValuesByAccount });
      queryClient.invalidateQueries({ queryKey: ["investments", "current-values-by-month"] });
      queryClient.invalidateQueries({ queryKey: ["net-worth"] });
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
    },
  });
}

export function useDeleteInvestment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const result = await deleteInvestment(id);
      if ("error" in result) throw new Error(result.error);
      return result.data;
    },
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
      toast.error(_err.message);
    },
    onSuccess: () => {
      toast.success("Inversión eliminada");
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: INVESTMENT_KEYS.all });
      queryClient.invalidateQueries({ queryKey: INVESTMENT_KEYS.currentValuesByAccount });
      queryClient.invalidateQueries({ queryKey: ["investments", "current-values-by-month"] });
      queryClient.invalidateQueries({ queryKey: ["net-worth"] });
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
    },
  });
}

export function useInvestmentSales() {
  return useQuery({
    queryKey: INVESTMENT_KEYS.sales,
    queryFn: async () => {
      const result = await getInvestmentSales();
      if ("error" in result) throw new Error(result.error);
      return result.data;
    },
    staleTime: 5 * 60_000,
    gcTime: 15 * 60_000,
  });
}

export function useDeleteInvestmentSale() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (saleId: string) => {
      const result = await deleteInvestmentSale(saleId);
      if ("error" in result) throw new Error(result.error);
      return result.data;
    },
    onError: (err: Error) => toast.error(err.message),
    onSuccess: () => toast.success("Venta eliminada"),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: INVESTMENT_KEYS.all });
      queryClient.invalidateQueries({ queryKey: INVESTMENT_KEYS.sales });
      queryClient.invalidateQueries({ queryKey: INVESTMENT_KEYS.currentValuesByAccount });
      queryClient.invalidateQueries({ queryKey: ["investments", "current-values-by-month"] });
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      queryClient.invalidateQueries({ queryKey: ["net-worth"] });
    },
  });
}

export function useSellInvestment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: SellInvestmentInput) => {
      const result = await sellInvestment(input);
      if ("error" in result) throw new Error(result.error);
      return result.data;
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
    onSuccess: () => {
      toast.success("Venta registrada");
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: INVESTMENT_KEYS.all });
      queryClient.invalidateQueries({ queryKey: INVESTMENT_KEYS.sales });
      queryClient.invalidateQueries({ queryKey: INVESTMENT_KEYS.currentValuesByAccount });
      queryClient.invalidateQueries({ queryKey: ["investments", "current-values-by-month"] });
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      queryClient.invalidateQueries({ queryKey: ["net-worth"] });
    },
  });
}

export function useTransferInvestmentPosition() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: TransferInvestmentPositionInput) => {
      const result = await transferInvestmentPosition(input);
      if ("error" in result) throw new Error(result.error);
      return result.data;
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
    onSuccess: () => {
      toast.success("Posicion transferida");
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: INVESTMENT_KEYS.all });
      queryClient.invalidateQueries({ queryKey: INVESTMENT_KEYS.currentValuesByAccount });
      queryClient.invalidateQueries({ queryKey: ["investments", "current-values-by-month"] });
      queryClient.invalidateQueries({ queryKey: ["net-worth"] });
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      queryClient.invalidateQueries({ queryKey: ["opening-balances"] });
      queryClient.invalidateQueries({ queryKey: ["months"] });
    },
  });
}

export function useCurrentPrices(
  tickers: { key: string; ticker?: string | null; isin?: string | null; assetType: string }[],
  baseCurrency: string
) {
  const tickerKeys = tickers.map((t) => t.key).sort();
  const tickersKey = tickerKeys.join("|");
  return useQuery({
    queryKey: INVESTMENT_KEYS.prices(baseCurrency, tickersKey),
    enabled: tickers.length > 0 && !!baseCurrency,
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    queryFn: async () => {
      const result = await fetchCurrentPrices(tickers, baseCurrency);
      if ("error" in result) throw new Error(result.error);
      return result.data;
    },
  });
}
