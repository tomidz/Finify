"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getRecurringTransactions,
  createRecurring,
  updateRecurring,
  deleteRecurring,
  getPendingRecurring,
} from "@/actions/recurring";
import type {
  CreateRecurringInput,
  UpdateRecurringInput,
} from "@/lib/validations/recurring.schema";
import type { RecurringWithRelations } from "@/types/recurring";
import { toast } from "sonner";

const RECURRING_KEYS = {
  all: ["recurring"] as const,
  pending: (year: number, month: number) =>
    ["recurring", "pending", year, month] as const,
};

export function useRecurringTransactions() {
  return useQuery({
    queryKey: RECURRING_KEYS.all,
    queryFn: async () => {
      const result = await getRecurringTransactions();
      if ("error" in result) throw new Error(result.error);
      return result.data;
    },
    staleTime: 10 * 60_000,
  });
}

export function usePendingRecurring(year: number, month: number) {
  return useQuery({
    queryKey: RECURRING_KEYS.pending(year, month),
    enabled: year > 0 && month > 0,
    queryFn: async () => {
      const result = await getPendingRecurring(year, month);
      if ("error" in result) throw new Error(result.error);
      return result.data;
    },
    staleTime: 60_000,
  });
}

export function useCreateRecurring() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateRecurringInput) => {
      const result = await createRecurring(input);
      if ("error" in result) throw new Error(result.error);
      return result.data;
    },
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: RECURRING_KEYS.all });
    },
    onError: (err: Error) => toast.error(err.message),
    onSuccess: () => {
      toast.success("Recurrente creada");
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: RECURRING_KEYS.all });
      queryClient.invalidateQueries({ queryKey: ["forecast"] });
    },
  });
}

export function useUpdateRecurring() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: UpdateRecurringInput) => {
      const result = await updateRecurring(input);
      if ("error" in result) throw new Error(result.error);
      return result.data;
    },
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
    onError: (_err, _input, context) => {
      if (context?.previous) {
        queryClient.setQueryData(RECURRING_KEYS.all, context.previous);
      }
      toast.error(_err.message);
    },
    onSuccess: () => {
      toast.success("Recurrente actualizada");
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: RECURRING_KEYS.all });
      queryClient.invalidateQueries({ queryKey: ["forecast"] });
    },
  });
}

export function useDeleteRecurring() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const result = await deleteRecurring(id);
      if ("error" in result) throw new Error(result.error);
      return result.data;
    },
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
    onError: (_err, _id, context) => {
      if (context?.previous) {
        queryClient.setQueryData(RECURRING_KEYS.all, context.previous);
      }
      toast.error(_err.message);
    },
    onSuccess: () => {
      toast.success("Recurrente eliminada");
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: RECURRING_KEYS.all });
      queryClient.invalidateQueries({ queryKey: ["forecast"] });
    },
  });
}
