"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            gcTime: 15 * 60_000,
            retry: 1,
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
