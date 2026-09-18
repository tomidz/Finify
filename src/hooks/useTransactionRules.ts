"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getTransactionRules,
  createTransactionRule,
  updateTransactionRule,
  deleteTransactionRule,
  matchTransactionRules,
} from "@/actions/transaction-rules";
import type {
  CreateTransactionRuleInput,
  UpdateTransactionRuleInput,
} from "@/lib/validations/transaction-rules.schema";
import type { TransactionRuleWithCategory } from "@/types/transaction-rules";
import { toast } from "sonner";
import { errorMessage, unwrapResult } from "@/lib/action-result";

const RULES_KEYS = {
  all: ["transaction-rules"] as const,
};

export function useTransactionRules() {
  return useQuery({
    queryKey: RULES_KEYS.all,
    queryFn: async () => unwrapResult(await getTransactionRules()),
    staleTime: 1 * 60_000,
  });
}

export function useCreateTransactionRule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateTransactionRuleInput) =>
      unwrapResult(await createTransactionRule(input)),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: RULES_KEYS.all });
    },
    onError: (err: Error) => toast.error(errorMessage(err)),
    onSuccess: () => {
      toast.success("Regla creada");
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: RULES_KEYS.all });
    },
  });
}

export function useUpdateTransactionRule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: UpdateTransactionRuleInput) =>
      unwrapResult(await updateTransactionRule(input)),
    onMutate: async (updatedRule) => {
      await queryClient.cancelQueries({ queryKey: RULES_KEYS.all });
      const previous = queryClient.getQueryData<TransactionRuleWithCategory[]>(
        RULES_KEYS.all
      );
      queryClient.setQueryData<TransactionRuleWithCategory[]>(
        RULES_KEYS.all,
        (old) =>
          (old ?? []).map((rule) =>
            rule.id === updatedRule.id ? { ...rule, ...updatedRule } : rule
          )
      );
      return { previous };
    },
    onError: (_err, _input, context) => {
      if (context?.previous) {
        queryClient.setQueryData(RULES_KEYS.all, context.previous);
      }
      toast.error(errorMessage(_err));
    },
    onSuccess: () => {
      toast.success("Regla actualizada");
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: RULES_KEYS.all });
    },
  });
}

export function useDeleteTransactionRule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => unwrapResult(await deleteTransactionRule(id)),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: RULES_KEYS.all });
      const previous = queryClient.getQueryData<TransactionRuleWithCategory[]>(
        RULES_KEYS.all
      );
      queryClient.setQueryData<TransactionRuleWithCategory[]>(
        RULES_KEYS.all,
        (old) => (old ?? []).filter((rule) => rule.id !== id)
      );
      return { previous };
    },
    onError: (_err, _id, context) => {
      if (context?.previous) {
        queryClient.setQueryData(RULES_KEYS.all, context.previous);
      }
      toast.error(errorMessage(_err));
    },
    onSuccess: () => {
      toast.success("Regla eliminada");
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: RULES_KEYS.all });
    },
  });
}

export function useMatchRules() {
  return useMutation({
    mutationFn: async ({
      description,
      notes,
    }: {
      description: string;
      notes?: string | null;
    }) => unwrapResult(await matchTransactionRules(description, notes)),
  });
}
