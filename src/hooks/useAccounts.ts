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
} from "@/actions/accounts";
import type { CreateAccountInput, UpdateAccountInput } from "@/lib/validations/account.schema";
import type { Account } from "@/types/accounts";
import { toast } from "sonner";

export function useAccounts() {
  return useQuery({
    queryKey: ["accounts"],
    queryFn: async () => {
      const result = await getAccounts();
      if ("error" in result) throw new Error(result.error);
      return result.data;
    },
    staleTime: 5 * 60_000,
  });
}

export function useSuspenseAccounts() {
  return useSuspenseQuery({
    queryKey: ["accounts"],
    queryFn: async () => {
      const result = await getAccounts();
      if ("error" in result) throw new Error(result.error);
      return result.data;
    },
    staleTime: 5 * 60_000,
  });
}

export function useCurrencies() {
  return useQuery({
    queryKey: ["currencies"],
    queryFn: async () => {
      const result = await getCurrencies();
      if ("error" in result) throw new Error(result.error);
      return result.data;
    },
    staleTime: Infinity,
  });
}

export function useSuspenseCurrencies() {
  return useSuspenseQuery({
    queryKey: ["currencies"],
    queryFn: async () => {
      const result = await getCurrencies();
      if ("error" in result) throw new Error(result.error);
      return result.data;
    },
    staleTime: Infinity,
  });
}

export function useCreateAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateAccountInput) => {
      const result = await createAccount(input);
      if ("error" in result) throw new Error(result.error);
      return result.data;
    },
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
    onError: (_err, _input, context) => {
      if (context?.previous) {
        queryClient.setQueryData(["accounts"], context.previous);
      }
      toast.error(_err.message);
    },
    onSuccess: () => {
      toast.success("Cuenta creada correctamente");
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
      queryClient.invalidateQueries({ queryKey: ["opening-balances"] });
    },
  });
}

export function useUpdateAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: UpdateAccountInput) => {
      const result = await updateAccount(input);
      if ("error" in result) throw new Error(result.error);
      return result.data;
    },
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
    onError: (_err, _input, context) => {
      if (context?.previous) {
        queryClient.setQueryData(["accounts"], context.previous);
      }
      toast.error(_err.message);
    },
    onSuccess: () => {
      toast.success("Cuenta actualizada correctamente");
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
      queryClient.invalidateQueries({ queryKey: ["opening-balances"] });
      queryClient.invalidateQueries({ queryKey: ["accountInitialBalance"] });
    },
  });
}

export function useAccountInitialBalance(accountId: string | undefined) {
  return useQuery({
    queryKey: ["accountInitialBalance", accountId],
    enabled: !!accountId,
    queryFn: async () => {
      if (!accountId) return null;
      const result = await getAccountInitialBalance(accountId);
      if ("error" in result) throw new Error(result.error);
      return result.data;
    },
    staleTime: 10 * 60_000,
  });
}

export function useAccountById(accountId: string | undefined) {
  return useQuery({
    queryKey: ["account", accountId],
    enabled: !!accountId,
    queryFn: async () => {
      if (!accountId) return null;
      const result = await getAccountById(accountId);
      if ("error" in result) throw new Error(result.error);
      return result.data;
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
      const result = await getAccountBalanceHistory(accountId);
      if ("error" in result) throw new Error(result.error);
      return result.data;
    },
    staleTime: 2 * 60_000,
  });
}

export function useDeleteAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const result = await deleteAccount(id);
      if ("error" in result) throw new Error(result.error);
      return result.data;
    },
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ["accounts"] });
      const previous = queryClient.getQueryData<Account[]>(["accounts"]);
      queryClient.setQueryData<Account[]>(["accounts"], (old) =>
        (old ?? []).filter((acc) => acc.id !== id)
      );
      return { previous };
    },
    onError: (_err, _id, context) => {
      if (context?.previous) {
        queryClient.setQueryData(["accounts"], context.previous);
      }
      toast.error(_err.message);
    },
    onSuccess: () => {
      toast.success("Cuenta eliminada correctamente");
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
    },
  });
}
