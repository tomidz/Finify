import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { InvestmentsTable } from "./_components/InvestmentsTable";
import { SalesHistoryTable } from "./_components/SalesHistoryTable";

export default function InvestmentsPage() {
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Inversiones</h1>
        <p className="text-muted-foreground text-sm">
          Registrá tus compras, mirá el portfolio actual y revisá el historial de ventas.
        </p>
      </div>
      <Tabs defaultValue="holdings" className="space-y-4">
        <TabsList>
          <TabsTrigger value="holdings">Cartera</TabsTrigger>
          <TabsTrigger value="sales">Historial de ventas</TabsTrigger>
        </TabsList>
        <TabsContent value="holdings" className="space-y-4">
          <Suspense fallback={<InvestmentsPageFallback />}>
            <InvestmentsTable />
          </Suspense>
        </TabsContent>
        <TabsContent value="sales" className="space-y-4">
          <Suspense fallback={<InvestmentsPageFallback />}>
            <SalesHistoryTable />
          </Suspense>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function InvestmentsPageFallback() {
  return (
    <div className="space-y-3">
      <Skeleton className="h-10 w-40" />
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-80 w-full" />
    </div>
  );
}
