import { Section } from "@/components/section";
import { StatCard, StatGrid } from "@/components/stat-card";
import {
  PageHeader,
  PageHeaderActions,
  PageHeaderTitle,
  PageHeaderTitleGroup,
} from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { NetWorthEvolutionChart } from "./_components/NetWorthEvolutionChart";

/** The route's loading state, and the page's until its first figures arrive. */
export default function NetWorthLoading() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader>
        <PageHeaderTitleGroup>
          <PageHeaderTitle>Patrimonio neto</PageHeaderTitle>
          <Skeleton className="h-5 w-40" />
        </PageHeaderTitleGroup>
        <PageHeaderActions>
          <Skeleton className="h-8 w-24" />
        </PageHeaderActions>
      </PageHeader>
      <StatGrid columns={3}>
        <StatCard label="Total activos" value={null} loading />
        <StatCard label="Total pasivos" value={null} loading />
        <StatCard label="Patrimonio neto" value={null} loading />
      </StatGrid>
      <NetWorthEvolutionChart data={[]} currencySymbol="" loading />
      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="Activos">
          <Skeleton className="h-40 rounded-lg" />
        </Section>
        <Section title="Pasivos">
          <Skeleton className="h-40 rounded-lg" />
        </Section>
      </div>
    </div>
  );
}
