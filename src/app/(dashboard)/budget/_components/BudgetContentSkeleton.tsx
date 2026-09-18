import { StatCard, StatGrid } from "@/components/stat-card";
import { Skeleton } from "@/components/ui/skeleton";

const STAT_LABELS = ["Ingresos", "Gastos", "Inversiones", "Ahorro"];

/** The budget's cards and category groups while they load. */
export function BudgetContentSkeleton() {
  return (
    <div aria-busy className="flex flex-col gap-6">
      <StatGrid columns={4}>
        {STAT_LABELS.map((label) => (
          <StatCard key={label} label={label} value={null} sub="Plan" loading />
        ))}
      </StatGrid>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 3 }, (_, index) => (
          <Skeleton key={index} className="h-72 w-full rounded-lg" />
        ))}
      </div>
    </div>
  );
}
