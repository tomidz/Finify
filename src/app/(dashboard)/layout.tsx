import { Suspense } from "react";
import { cookies } from "next/headers";
import { requireUser } from "@/lib/supabase/auth";
import { AppHeader } from "@/components/app-header";
import { AppSidebar } from "@/components/app-sidebar";
import { PageCrumbsProvider } from "@/components/page-crumbs";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";

async function DashboardLayoutContent({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();
  const userEmail = user.email ?? "";

  const cookieStore = await cookies();
  const sidebarCookie = cookieStore.get("sidebar_state")?.value;
  const defaultOpen = sidebarCookie !== "false";

  return (
    <SidebarProvider defaultOpen={defaultOpen} className="h-svh min-h-0 overflow-hidden">
      <AppSidebar userEmail={userEmail} />
      {/* A collapsed sidebar leaves no gutter of its own, so this wrapper gives
          the canvas card its left margin. */}
      <div className="flex min-w-0 flex-1 md:peer-data-[state=collapsed]:ml-2">
        <SidebarInset>
          <PageCrumbsProvider>
            <AppHeader />
            <div className="flex flex-1 flex-col gap-4 p-4">{children}</div>
          </PageCrumbsProvider>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-svh w-full items-center justify-center">
          <p className="text-muted-foreground">Cargando…</p>
        </div>
      }
    >
      <DashboardLayoutContent>{children}</DashboardLayoutContent>
    </Suspense>
  );
}
