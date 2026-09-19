import { Suspense } from "react";
import { DashboardClient, DashboardSkeleton } from "./_components/DashboardClient";

export default function DashboardPage() {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <DashboardClient />
    </Suspense>
  );
}
