"use client";

import {
  useQuery,
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import {
  getAccounts,
  getCurrencies,
  createAccount,
  updateAccount,
  deleteAccount,
  getAccountInitialBalance,
  getAccountById,
  getAccountBalanceHistory,
  getAccountCurrentAmount,
} from "@/actions/accounts";
import type { CreateAccountInput, UpdateAccountInput } from "@/lib/validations/account.schema";
import type { Account } from "@/types/accounts";
import { invalidateLedger } from "@/lib/query-keys";
import { toast } from "sonner";
import { errorMessage, unwrapResult } from "@/lib/action-result";

export function useAccounts() {
  return useQuery({
    queryKey: ["accounts"],
    queryFn: async () => unwrapResult(await getAccounts()),
    staleTime: 5 * 60_000,
  });
}

export function useSuspenseAccounts() {
  return useSuspenseQuery({
    queryKey: ["accounts"],
    queryFn: async () => unwrapResult(await getAccounts()),
    staleTime: 5 * 60_000,
  });
}

export function useCurrencies() {
  return useQuery({
    queryKey: ["currencies"],
    queryFn: async () => unwrapResult(await getCurrencies()),
    staleTime: Infinity,
  });
}

export function useSuspenseCurrencies() {
  return useSuspenseQuery({
    queryKey: ["currencies"],
    queryFn: async () => unwrapResult(await getCurrencies()),
    staleTime: Infinity,
  });
}

export function useCreateAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateAccountInput) => unwrapResult(await createAccount(input)),
    onMutate: async (newAccount) => {
      await queryClient.cancelQueries({ queryKey: ["accounts"] });
      const previous = queryClient.getQueryData<Account[]>(["accounts"]);
      queryClient.setQueryData<Account[]>(["accounts"], (old) => [
        ...(old ?? []),
        {
          id: `temp-${Date.now()}`,
          user_id: "",
          name: newAccount.name,
          account_type: newAccount.account_type,
          currency: newAccount.currency,
          is_active: true,
          notes: newAccount.notes ?? null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ]);
      return { previous };
    },
    onError: (err, _input, context) => {
      if (context?.previous) {
        queryClient.setQueryData(["accounts"], context.previous);
      }
      toast.error(errorMessage(err));
    },
    onSuccess: () => {
      toast.success("Cuenta creada correctamente");
    },
    onSettled: () => {
      invalidateLedger(queryClient);
    },
  });
}

export function useUpdateAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: UpdateAccountInput) => unwrapResult(await updateAccount(input)),
    onMutate: async (updatedAccount) => {
      await queryClient.cancelQueries({ queryKey: ["accounts"] });
      const previous = queryClient.getQueryData<Account[]>(["accounts"]);
      queryClient.setQueryData<Account[]>(["accounts"], (old) =>
        (old ?? []).map((acc) =>
          acc.id === updatedAccount.id
            ? { ...acc, ...updatedAccount, updated_at: new Date().toISOString() }
            : acc
        )
      );
      return { previous };
    },
    onError: (err, _input, context) => {
      if (context?.previous) {
        queryClient.setQueryData(["accounts"], context.previous);
      }
      toast.error(errorMessage(err));
    },
    onSuccess: () => {
      toast.success("Cuenta actualizada correctamente");
    },
    onSettled: () => {
      invalidateLedger(queryClient);
    },
  });
}

export function useAccountInitialBalance(accountId: string | undefined) {
  return useQuery({
    queryKey: ["accountInitialBalance", accountId],
    enabled: !!accountId,
    queryFn: async () => {
      if (!accountId) return null;
      return unwrapResult(await getAccountInitialBalance(accountId));
    },
    staleTime: 10 * 60_000,
  });
}

export function useAccountCurrentBalance(accountId: string | undefined) {
  return useQuery({
    queryKey: ["account", accountId, "current-balance"],
    enabled: !!accountId,
    queryFn: async () => {
      if (!accountId) return null;
      return unwrapResult(await getAccountCurrentAmount(accountId));
    },
    staleTime: 60_000,
  });
}

export function useAccountById(accountId: string | undefined) {
  return useQuery({
    queryKey: ["account", accountId],
    enabled: !!accountId,
    queryFn: async () => {
      if (!accountId) return null;
      return unwrapResult(await getAccountById(accountId));
    },
    staleTime: 5 * 60_000,
  });
}

export function useAccountBalanceHistory(accountId: string | undefined) {
  return useQuery({
    queryKey: ["account", accountId, "balance-history"],
    enabled: !!accountId,
    queryFn: async () => {
      if (!accountId) return [];
      return unwrapResult(await getAccountBalanceHistory(accountId));
    },
    staleTime: 2 * 60_000,
  });
}

export function useDeleteAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => unwrapResult(await deleteAccount(id)),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ["accounts"] });
      const previous = queryClient.getQueryData<Account[]>(["accounts"]);
      queryClient.setQueryData<Account[]>(["accounts"], (old) =>
        (old ?? []).filter((acc) => acc.id !== id)
      );
      return { previous };
    },
    onError: (err, _id, context) => {
      if (context?.previous) {
        queryClient.setQueryData(["accounts"], context.previous);
      }
      toast.error(errorMessage(err));
    },
    onSuccess: () => {
      toast.success("Cuenta eliminada correctamente");
    },
    onSettled: () => {
      invalidateLedger(queryClient);
    },
  });
}
