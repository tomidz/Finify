import { StatGrid } from "@/components/stat-card";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";

// The fallback of every route in the group without its own loading.tsx, so it
// stays generic: a page header, a row of stat cards and two blocks.
export default function DashboardLoading() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader>
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-8 w-36" />
      </PageHeader>
      <StatGrid columns={4}>
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-[74px] rounded-xl" />
        ))}
      </StatGrid>
      <Skeleton className="h-80 w-full rounded-xl" />
      <Skeleton className="h-80 w-full rounded-xl" />
    </div>
  );
}
