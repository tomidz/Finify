"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { getLedgerDrift } from "@/actions/diagnostics";
import { recalculateAllOpeningBalances } from "@/actions/months";
import { invalidateLedger } from "@/lib/query-keys";
import { errorMessage, unwrapResult } from "@/lib/action-result";

export function useLedgerDrift() {
  return useQuery({
    queryKey: ["ledger-drift"],
    queryFn: async () => unwrapResult(await getLedgerDrift()),
  });
}

export function useRecalculateAllOpeningBalances() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => unwrapResult(await recalculateAllOpeningBalances()),
    onSuccess: () => {
      toast.success("Saldos recalculados");
    },
    onError: (error) => {
      toast.error(errorMessage(error));
    },
    onSettled: () => {
      invalidateLedger(queryClient);
    },
  });
}
