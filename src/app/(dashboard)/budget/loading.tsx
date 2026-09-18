import {
  PageHeader,
  PageHeaderActions,
  PageHeaderDescription,
  PageHeaderTitle,
  PageHeaderTitleGroup,
} from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { BudgetContentSkeleton } from "./_components/BudgetContentSkeleton";

export default function BudgetLoading() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader>
        <PageHeaderTitleGroup>
          <PageHeaderTitle>Presupuesto</PageHeaderTitle>
          <PageHeaderDescription>Plan vs real por categoría.</PageHeaderDescription>
        </PageHeaderTitleGroup>
        <PageHeaderActions>
          <Skeleton className="h-8 w-54" />
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-8 w-28" />
        </PageHeaderActions>
      </PageHeader>
      <BudgetContentSkeleton />
    </div>
  );
}
