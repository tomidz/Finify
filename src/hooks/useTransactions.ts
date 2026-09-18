"use client";

import {
  keepPreviousData,
  useQuery,
  useMutation,
  useQueryClient,
  useInfiniteQuery,
  useSuspenseQuery,
} from "@tanstack/react-query";
import {
  getTransactions,
  getTransactionsPage,
  getBaseCurrency,
  getUsageCounts,
  createTransaction,
  createTransfer,
  updateTransaction,
  deleteTransaction,
  restoreTransaction,
} from "@/actions/transactions";
import { getPeriodSummary } from "@/actions/period-summary";
import type { CreateTransactionInput, CreateTransferInput, UpdateTransactionInput } from "@/lib/validations/transaction.schema";
import type { TransactionFeedFilters } from "@/types/transactions";
import { invalidateLedger } from "@/lib/query-keys";
import { toast } from "sonner";
import { errorMessage, unwrapResult } from "@/lib/action-result";

export const TRANSACTION_KEYS = {
  all: ["transactions"] as const,
  list: (monthId: string) => ["transactions", "month", monthId] as const,
  summary: (startMonthId: string, endMonthId: string) =>
    ["transactions", "summary", startMonthId, endMonthId] as const,
  feed: (monthId: string, filters: TransactionFeedFilters) =>
    ["transactions", "month", monthId, "feed", filters] as const,
  usageCounts: ["transactions", "usage-counts"] as const,
  baseCurrency: ["preferences", "base-currency"] as const,
};


/** Opening, income, expenses, other movements and closing of a month range. */
export function usePeriodSummary(startMonthId: string | null, endMonthId: string | null) {
  return useQuery({
    queryKey: TRANSACTION_KEYS.summary(startMonthId ?? "", endMonthId ?? ""),
    enabled: !!startMonthId && !!endMonthId,
    queryFn: async () => unwrapResult(await getPeriodSummary(startMonthId!, endMonthId!)),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });
}

export function useBaseCurrency() {
  return useQuery({
    queryKey: TRANSACTION_KEYS.baseCurrency,
    queryFn: async () => unwrapResult(await getBaseCurrency()),
    staleTime: Infinity,
    gcTime: Infinity,
  });
}

export function useSuspenseBaseCurrency() {
  return useSuspenseQuery({
    queryKey: TRANSACTION_KEYS.baseCurrency,
    queryFn: async () => unwrapResult(await getBaseCurrency()),
    staleTime: Infinity,
    gcTime: Infinity,
  });
}

export function useUsageCounts() {
  return useQuery({
    queryKey: TRANSACTION_KEYS.usageCounts,
    queryFn: async () => unwrapResult(await getUsageCounts()),
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
      return unwrapResult(await getTransactions(monthId));
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
      return unwrapResult(
        await getTransactionsPage({
          monthId,
          limit,
          offset: pageParam,
          ...filters,
        }),
      );
    },
    getNextPageParam: (lastPage) => lastPage.nextOffset,
    staleTime: 30_000,
    gcTime: 10 * 60_000,
    refetchOnWindowFocus: false,
  });
}

export function useCreateTransaction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateTransactionInput) =>
      unwrapResult(await createTransaction(input)),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: TRANSACTION_KEYS.all });
    },
    onError: (error: Error) => {
      toast.error(errorMessage(error));
    },
    onSuccess: () => {
      toast.success("Transacción creada correctamente");
    },
    // Not awaited: the dialog closes as soon as the write lands and the
    // figures refresh behind it.
    onSettled: () => {
      invalidateLedger(queryClient);
    },
  });
}

export function useCreateTransfer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateTransferInput) => unwrapResult(await createTransfer(input)),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: TRANSACTION_KEYS.all });
    },
    onError: (error: Error) => {
      toast.error(errorMessage(error));
    },
    onSuccess: () => {
      toast.success("Transferencia creada correctamente");
    },
    // Not awaited: the dialog closes as soon as the write lands and the
    // figures refresh behind it.
    onSettled: () => {
      invalidateLedger(queryClient);
    },
  });
}

export function useUpdateTransaction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: UpdateTransactionInput) =>
      unwrapResult(await updateTransaction(input)),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: TRANSACTION_KEYS.all });
    },
    onError: (error: Error) => {
      toast.error(errorMessage(error));
    },
    onSuccess: () => {
      toast.success("Transacción actualizada correctamente");
    },
    // Not awaited: the dialog closes as soon as the write lands and the
    // figures refresh behind it.
    onSettled: () => {
      invalidateLedger(queryClient);
    },
  });
}

export function useDeleteTransaction() {
  const queryClient = useQueryClient();
  const restore = useRestoreTransaction();
  return useMutation({
    mutationFn: async (id: string) => unwrapResult(await deleteTransaction(id)),
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
      toast.error(errorMessage(error));
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
    // Not awaited: the dialog closes as soon as the write lands and the
    // figures refresh behind it.
    onSettled: () => {
      invalidateLedger(queryClient);
    },
  });
}

export function useRestoreTransaction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => unwrapResult(await restoreTransaction(id)),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: TRANSACTION_KEYS.all });
    },
    onError: (error: Error) => {
      toast.error(errorMessage(error));
    },
    onSuccess: () => {
      toast.success("Transacción restaurada");
    },
    // Not awaited: the dialog closes as soon as the write lands and the
    // figures refresh behind it.
    onSettled: () => {
      invalidateLedger(queryClient);
    },
  });
}
