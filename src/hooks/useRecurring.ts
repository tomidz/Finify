"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getRecurringTransactions,
  createRecurring,
  updateRecurring,
  deleteRecurring,
  getPendingRecurring,
  registerRecurringOccurrence,
} from "@/actions/recurring";
import type {
  CreateRecurringInput,
  UpdateRecurringInput,
} from "@/lib/validations/recurring.schema";
import type { RecurringWithRelations } from "@/types/recurring";
import { invalidateForecast, invalidateLedger } from "@/lib/query-keys";
import { toast } from "sonner";
import { errorMessage, unwrapResult } from "@/lib/action-result";

const RECURRING_KEYS = {
  all: ["recurring"] as const,
  pending: (year: number, month: number) =>
    ["recurring", "pending", year, month] as const,
};

export function useRecurringTransactions() {
  return useQuery({
    queryKey: RECURRING_KEYS.all,
    queryFn: async () => unwrapResult(await getRecurringTransactions()),
    staleTime: 10 * 60_000,
  });
}

export function usePendingRecurring(year: number, month: number) {
  return useQuery({
    queryKey: RECURRING_KEYS.pending(year, month),
    enabled: year > 0 && month > 0,
    queryFn: async () => unwrapResult(await getPendingRecurring(year, month)),
    staleTime: 60_000,
  });
}

export function useRegisterRecurringOccurrence() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { recurring_id: string; date: string }) => unwrapResult(await registerRecurringOccurrence(input)),
    onError: (err) => toast.error(errorMessage(err)),
    onSuccess: () => toast.success("Transacción registrada"),
    onSettled: () => {
      // It creates a real transaction: refresh everything financial.
      queryClient.invalidateQueries({ queryKey: RECURRING_KEYS.all });
      invalidateLedger(queryClient);
    },
  });
}

export function useCreateRecurring() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateRecurringInput) => unwrapResult(await createRecurring(input)),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: RECURRING_KEYS.all });
    },
    onError: (err) => toast.error(errorMessage(err)),
    onSuccess: () => {
      toast.success("Recurrente creada");
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: RECURRING_KEYS.all });
      invalidateForecast(queryClient);
    },
  });
}

export function useUpdateRecurring() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: UpdateRecurringInput) => unwrapResult(await updateRecurring(input)),
    onMutate: async (updatedItem) => {
      await queryClient.cancelQueries({ queryKey: RECURRING_KEYS.all });
      const previous = queryClient.getQueryData<RecurringWithRelations[]>(
        RECURRING_KEYS.all
      );
      queryClient.setQueryData<RecurringWithRelations[]>(
        RECURRING_KEYS.all,
        (old) =>
          (old ?? []).map((item) =>
            item.id === updatedItem.id
              ? { ...item, ...updatedItem, updated_at: new Date().toISOString() }
              : item
          )
      );
      return { previous };
    },
    onError: (err, _input, context) => {
      if (context?.previous) {
        queryClient.setQueryData(RECURRING_KEYS.all, context.previous);
      }
      toast.error(errorMessage(err));
    },
    onSuccess: () => {
      toast.success("Recurrente actualizada");
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: RECURRING_KEYS.all });
      invalidateForecast(queryClient);
    },
  });
}

export function useDeleteRecurring() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => unwrapResult(await deleteRecurring(id)),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: RECURRING_KEYS.all });
      const previous = queryClient.getQueryData<RecurringWithRelations[]>(
        RECURRING_KEYS.all
      );
      queryClient.setQueryData<RecurringWithRelations[]>(
        RECURRING_KEYS.all,
        (old) => (old ?? []).filter((item) => item.id !== id)
      );
      return { previous };
    },
    onError: (err, _id, context) => {
      if (context?.previous) {
        queryClient.setQueryData(RECURRING_KEYS.all, context.previous);
      }
      toast.error(errorMessage(err));
    },
    onSuccess: () => {
      toast.success("Recurrente eliminada");
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: RECURRING_KEYS.all });
      invalidateForecast(queryClient);
    },
  });
}
