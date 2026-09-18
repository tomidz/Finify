"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getUserPreferences,
  updateUserPreferences,
} from "@/actions/user-preferences";
import { toast } from "sonner";
import { errorMessage, unwrapResult } from "@/lib/action-result";

const PREF_KEYS = {
  all: ["user-preferences"] as const,
  // Same key the rest of the app reads (TRANSACTION_KEYS.baseCurrency) —
  // an invalidation under a different key never reaches those queries.
  baseCurrency: ["preferences", "base-currency"] as const,
};

export function useUserPreferences() {
  return useQuery({
    queryKey: PREF_KEYS.all,
    queryFn: async () => unwrapResult(await getUserPreferences()),
    staleTime: Infinity,
  });
}

export function useUpdateUserPreferences() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { base_currency?: string }) =>
      unwrapResult(await updateUserPreferences(input)),
    onSuccess: () => {
      // Base currency feeds every stored-base computation; refresh everything
      // financial, not just the preference queries.
      queryClient.invalidateQueries();
      toast.success("Preferencias guardadas");
    },
    onError: (err: Error) => toast.error(errorMessage(err)),
  });
}
