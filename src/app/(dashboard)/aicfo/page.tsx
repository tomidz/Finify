import { getAiSessions } from "@/actions/ai-chat";
import {
  PageHeader,
  PageHeaderDescription,
  PageHeaderTitle,
  PageHeaderTitleGroup,
} from "@/components/ui/page-header";

import { AicfoChat } from "./_components/AicfoChat";

export default async function AicfoPage() {
  const sessionsResult = await getAiSessions();
  const sessions = "data" in sessionsResult ? sessionsResult.data : [];
  const sessionsError = "error" in sessionsResult ? sessionsResult.error : null;

  return (
    <div className="flex h-[calc(100vh-8rem)] flex-col gap-6">
      <PageHeader>
        <PageHeaderTitleGroup>
          <PageHeaderTitle>AI CFO</PageHeaderTitle>
          <PageHeaderDescription>
            Preguntá por tus gastos, presupuesto, inversiones y patrimonio.
          </PageHeaderDescription>
        </PageHeaderTitleGroup>
      </PageHeader>
      <AicfoChat initialSessions={sessions} initialSessionsError={sessionsError} />
    </div>
  );
}
