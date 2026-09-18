"use client";

import { useCallback, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Plus } from "lucide-react";
import { PageButton } from "@/components/page-button";
import {
  PageHeader,
  PageHeaderActions,
  PageHeaderTitle,
  PageHeaderTitleGroup,
} from "@/components/ui/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useShortcut } from "@/lib/keyboard";
import { InvestmentDialog } from "./InvestmentDialog";
import { InvestmentsTable } from "./InvestmentsTable";
import { SalesHistoryTable } from "./SalesHistoryTable";

export function InvestmentsClient() {
  // The tab lives in the URL, so a reload or coming back keeps it.
  const searchParams = useSearchParams();
  const tab = searchParams.get("tab") === "sales" ? "sales" : "holdings";
  const setTab = useCallback((next: string) => {
    const params = new URLSearchParams(window.location.search);
    if (next === "sales") params.set("tab", next);
    else params.delete("tab");
    const query = params.toString();
    window.history.replaceState(null, "", query ? `?${query}` : window.location.pathname);
  }, []);

  const [creating, setCreating] = useState(false);
  const openNew = useCallback(() => setCreating(true), []);
  useShortcut("n", openNew);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader>
        <PageHeaderTitleGroup>
          <PageHeaderTitle>Inversiones</PageHeaderTitle>
        </PageHeaderTitleGroup>
        <PageHeaderActions>
          <PageButton icon={Plus} kbd="N" onClick={openNew}>
            Nueva inversión
          </PageButton>
        </PageHeaderActions>
      </PageHeader>

      <Tabs value={tab} onValueChange={setTab} className="gap-4">
        <TabsList>
          <TabsTrigger value="holdings">Cartera</TabsTrigger>
          <TabsTrigger value="sales">Ventas</TabsTrigger>
        </TabsList>
        <TabsContent value="holdings">
          <InvestmentsTable onCreate={openNew} />
        </TabsContent>
        <TabsContent value="sales">
          <SalesHistoryTable />
        </TabsContent>
      </Tabs>

      {!creating ? null : <InvestmentDialog investment={null} open onOpenChange={setCreating} />}
    </div>
  );
}
