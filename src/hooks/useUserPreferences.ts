"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getUserPreferences,
  updateUserPreferences,
} from "@/actions/user-preferences";
import { toast } from "sonner";

const PREF_KEYS = {
  all: ["user-preferences"] as const,
  // Same key the rest of the app reads (TRANSACTION_KEYS.baseCurrency) —
  // an invalidation under a different key never reaches those queries.
  baseCurrency: ["preferences", "base-currency"] as const,
};

export function useUserPreferences() {
  return useQuery({
    queryKey: PREF_KEYS.all,
    queryFn: async () => {
      const result = await getUserPreferences();
      if ("error" in result) throw new Error(result.error);
      return result.data;
    },
    staleTime: Infinity,
  });
}

export function useUpdateUserPreferences() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      base_currency?: string;
      fx_source?: string;
    }) => {
      const result = await updateUserPreferences(input);
      if ("error" in result) throw new Error(result.error);
      return result.data;
    },
    onSuccess: () => {
      // Base currency feeds every stored-base computation; refresh everything
      // financial, not just the preference queries.
      queryClient.invalidateQueries();
      toast.success("Preferencias guardadas");
    },
    onError: (err: Error) => toast.error(err.message),
  });
}
