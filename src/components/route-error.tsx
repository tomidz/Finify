"use client";

import { useEffect } from "react";

import { Button } from "@/components/ui/button";
import { UNEXPECTED_FAILURE } from "@/lib/action-result";
import { cn } from "@/lib/utils";

export type RouteErrorProps = {
  error: Error & { digest?: string };
  /** Fetches the segment again, unlike `reset`, which only re-renders it. */
  unstable_retry: () => void;
};

/**
 * What an error.tsx shows. A server error's message is hidden in production;
 * its digest matches the server's log line.
 */
export function RouteError({ title, error, unstable_retry, className }: RouteErrorProps & { title: string; className?: string }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className={cn("rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-center", className)}>
      <p className="font-medium text-destructive">{title}</p>
      <p className="mt-1 text-sm text-muted-foreground">{UNEXPECTED_FAILURE}</p>
      {!error.digest ? null : <p className="mt-1 text-xs text-muted-foreground">Código: {error.digest}</p>}
      <Button className="mt-3" variant="outline" onClick={() => unstable_retry()}>
        Reintentar
      </Button>
    </div>
  );
}
