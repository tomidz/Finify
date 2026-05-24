import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { AccountDetail } from "./_components/AccountDetail";

export default async function AccountDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <div className="space-y-6">
      <Suspense fallback={<Fallback />}>
        <AccountDetail accountId={id} />
      </Suspense>
    </div>
  );
}

function Fallback() {
  return (
    <div className="space-y-3">
      <Skeleton className="h-12 w-64" />
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-80 w-full" />
    </div>
  );
}
