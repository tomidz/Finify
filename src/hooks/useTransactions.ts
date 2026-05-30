"use client";

import {
  useQuery,
  useMutation,
  useQueryClient,
  useInfiniteQuery,
  useSuspenseQuery,
} from "@tanstack/react-query";
import {
  getTransactions,
  getTransactionsPage,
  getTransactionsForRange,
  getBaseCurrency,
  getUsageCounts,
  createTransaction,
  createTransfer,
  updateTransaction,
  deleteTransaction,
  restoreTransaction,
} from "@/actions/transactions";
import type { CreateTransactionInput, CreateTransferInput, UpdateTransactionInput } from "@/lib/validations/transaction.schema";
import type { TransactionFeedFilters } from "@/types/transactions";
import { toast } from "sonner";

export const TRANSACTION_KEYS = {
  all: ["transactions"] as const,
  list: (monthId: string) => ["transactions", "month", monthId] as const,
  feed: (monthId: string, filters: TransactionFeedFilters) =>
    ["transactions", "month", monthId, "feed", filters] as const,
  range: (start: string, end: string) =>
    ["transactions", "range", start, end] as const,
  usageCounts: ["transactions", "usage-counts"] as const,
  baseCurrency: ["preferences", "base-currency"] as const,
};

async function invalidateFinancialQueries(queryClient: ReturnType<typeof useQueryClient>) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: TRANSACTION_KEYS.all }),
    queryClient.invalidateQueries({ queryKey: ["months"] }),
    queryClient.invalidateQueries({ queryKey: ["opening-balances"] }),
    queryClient.invalidateQueries({ queryKey: ["budget", "summary"] }),
    queryClient.invalidateQueries({ queryKey: ["budget", "summary-range"] }),
    queryClient.invalidateQueries({ queryKey: ["net-worth"] }),
    queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
    queryClient.invalidateQueries({ queryKey: ["forecast"] }),
  ]);
}

export function useBaseCurrency() {
  return useQuery({
    queryKey: TRANSACTION_KEYS.baseCurrency,
    queryFn: async () => {
      const result = await getBaseCurrency();
      if ("error" in result) throw new Error(result.error);
      return result.data;
    },
    staleTime: Infinity,
    gcTime: Infinity,
  });
}

export function useSuspenseBaseCurrency() {
  return useSuspenseQuery({
    queryKey: TRANSACTION_KEYS.baseCurrency,
    queryFn: async () => {
      const result = await getBaseCurrency();
      if ("error" in result) throw new Error(result.error);
      return result.data;
    },
    staleTime: Infinity,
    gcTime: Infinity,
  });
}

export function useUsageCounts() {
  return useQuery({
    queryKey: TRANSACTION_KEYS.usageCounts,
    queryFn: async () => {
      const result = await getUsageCounts();
      if ("error" in result) throw new Error(result.error);
      return result.data;
    },
    staleTime: 5 * 60_000,
    gcTime: 15 * 60_000,
  });
}

export function useTransactions(monthId: string | null) {
  return useQuery({
    queryKey: TRANSACTION_KEYS.list(monthId ?? ""),
    enabled: !!monthId,
    queryFn: async () => {
      if (!monthId) return [];
      const result = await getTransactions(monthId);
      if ("error" in result) throw new Error(result.error);
      return result.data;
    },
    staleTime: 30_000,
    gcTime: 10 * 60_000,
    refetchOnWindowFocus: false,
  });
}

export function useInfiniteTransactions(
  monthId: string | null,
  filters: TransactionFeedFilters,
  limit = 50,
) {
  return useInfiniteQuery({
    queryKey: TRANSACTION_KEYS.feed(monthId ?? "", filters),
    enabled: !!monthId,
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      if (!monthId) {
        return { items: [], nextOffset: null };
      }
      const result = await getTransactionsPage({
        monthId,
        limit,
        offset: pageParam,
        ...filters,
      });
      if ("error" in result) throw new Error(result.error);
      return result.data;
    },
    getNextPageParam: (lastPage) => lastPage.nextOffset,
    staleTime: 30_000,
    gcTime: 10 * 60_000,
    refetchOnWindowFocus: false,
  });
}

export function useTransactionsForRange(
  startMonthId: string | null,
  endMonthId: string | null
) {
  return useQuery({
    queryKey: TRANSACTION_KEYS.range(startMonthId ?? "", endMonthId ?? ""),
    enabled: !!startMonthId && !!endMonthId,
    queryFn: async () => {
      if (!startMonthId || !endMonthId) return [];
      const result = await getTransactionsForRange(startMonthId, endMonthId);
      if ("error" in result) throw new Error(result.error);
      return result.data;
    },
    staleTime: 30_000,
    gcTime: 10 * 60_000,
    refetchOnWindowFocus: false,
  });
}

export function useCreateTransaction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateTransactionInput) => {
      const result = await createTransaction(input);
      if ("error" in result) throw new Error(result.error);
      return result.data;
    },
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: TRANSACTION_KEYS.all });
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
    onSuccess: () => {
      toast.success("Transacción creada correctamente");
    },
    onSettled: async () => {
      await invalidateFinancialQueries(queryClient);
    },
  });
}

export function useCreateTransfer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateTransferInput) => {
      const result = await createTransfer(input);
      if ("error" in result) throw new Error(result.error);
      return result.data;
    },
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: TRANSACTION_KEYS.all });
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
    onSuccess: () => {
      toast.success("Transferencia creada correctamente");
    },
    onSettled: async () => {
      await invalidateFinancialQueries(queryClient);
    },
  });
}

export function useUpdateTransaction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: UpdateTransactionInput) => {
      const result = await updateTransaction(input);
      if ("error" in result) throw new Error(result.error);
      return result.data;
    },
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: TRANSACTION_KEYS.all });
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
    onSuccess: () => {
      toast.success("Transacción actualizada correctamente");
    },
    onSettled: async () => {
      await invalidateFinancialQueries(queryClient);
    },
  });
}

export function useDeleteTransaction() {
  const queryClient = useQueryClient();
  const restore = useRestoreTransaction();
  return useMutation({
    mutationFn: async (id: string) => {
      const result = await deleteTransaction(id);
      if ("error" in result) throw new Error(result.error);
      return result.data;
    },
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: TRANSACTION_KEYS.all });
      const snapshots = queryClient.getQueriesData({
        queryKey: TRANSACTION_KEYS.all,
      });

      for (const [key, value] of snapshots) {
        if (!Array.isArray(value)) continue;
        queryClient.setQueryData(
          key,
          value.filter((tx) =>
            typeof tx === "object" && tx !== null && "id" in tx ? tx.id !== id : true,
          ),
        );
      }

      return { snapshots };
    },
    onError: (error: Error, _id, context) => {
      for (const [key, value] of context?.snapshots ?? []) {
        queryClient.setQueryData(key, value);
      }
      toast.error(error.message);
    },
    onSuccess: (_, deletedId) => {
      toast.success("Transacción eliminada", {
        action: {
          label: "Deshacer",
          onClick: () => restore.mutate(deletedId),
        },
        duration: 8000,
      });
    },
    onSettled: async () => {
      await invalidateFinancialQueries(queryClient);
    },
  });
}

export function useRestoreTransaction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const result = await restoreTransaction(id);
      if ("error" in result) throw new Error(result.error);
      return result.data;
    },
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: TRANSACTION_KEYS.all });
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
    onSuccess: () => {
      toast.success("Transacción restaurada");
    },
    onSettled: async () => {
      await invalidateFinancialQueries(queryClient);
    },
  });
}
