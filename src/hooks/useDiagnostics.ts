"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { getLedgerDrift } from "@/actions/diagnostics";
import { recalculateAllOpeningBalances } from "@/actions/months";
import { invalidateLedger } from "@/lib/query-keys";

export function useLedgerDrift() {
  return useQuery({
    queryKey: ["ledger-drift"],
    queryFn: async () => {
      const result = await getLedgerDrift();
      if ("error" in result) throw new Error(result.error);
      return result.data;
    },
  });
}

export function useRecalculateAllOpeningBalances() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const result = await recalculateAllOpeningBalances();
      if ("error" in result) throw new Error(result.error);
      return result.data;
    },
    onSuccess: () => {
      toast.success("Saldos recalculados");
    },
    onError: (error) => {
      toast.error(error.message);
    },
    onSettled: () => {
      invalidateLedger(queryClient);
    },
  });
}
