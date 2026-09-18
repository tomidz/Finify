import { Suspense } from "react";
import { StateCard } from "@/components/state-card";
import { AccountDetail } from "./_components/AccountDetail";

export default async function AccountDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <div className="flex flex-col gap-6">
      <Suspense fallback={<StateCard variant="loading" className="min-h-80" />}>
        <AccountDetail accountId={id} />
      </Suspense>
    </div>
  );
}
