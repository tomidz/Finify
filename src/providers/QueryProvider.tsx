"use client";

import { QueryCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { errorMessage, isTransportError } from "@/lib/action-result";

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        // A screen shows its own error when it has nothing to show. When a
        // refresh fails behind data already on screen, that data may be
        // outdated: say so.
        queryCache: new QueryCache({
          onError: (error, query) => {
            if (query.state.data === undefined) return;
            toast.error(`No se pudo actualizar: ${errorMessage(error)}`, { id: "query-refresh-failed" });
          },
        }),
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            gcTime: 15 * 60_000,
            // Only a request that failed on the way: an action's own error
            // (not signed in, not found) answers the same the second time.
            retry: (failures, error) => failures < 1 && isTransportError(error),
            refetchOnWindowFocus: false,
            refetchOnReconnect: false,
            // refetchOnMount must stay on: invalidateQueries only refetches
            // MOUNTED queries — inactive ones are just flagged stale, and with
            // refetchOnMount:false the flag never triggered a fetch, so every
            // cross-page invalidation was a permanent no-op (stale balances).
          },
          mutations: {
            retry: 0,
          },
        },
      })
  );

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
