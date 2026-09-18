import { Suspense } from "react";
import { StateCard } from "@/components/state-card";
import { Skeleton } from "@/components/ui/skeleton";
import { InvestmentsClient } from "./_components/InvestmentsClient";

export default function InvestmentsPage() {
  return (
    <Suspense fallback={<InvestmentsPageFallback />}>
      <InvestmentsClient />
    </Suspense>
  );
}

function InvestmentsPageFallback() {
  return (
    <div className="flex flex-col gap-4">
      <Skeleton className="h-8 w-40" />
      <Skeleton className="h-9 w-48" />
      <StateCard variant="loading" className="min-h-96" />
    </div>
  );
}
