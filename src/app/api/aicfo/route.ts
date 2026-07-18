import { createAgentUIStreamResponse } from "ai";

import { createAicfoAgent } from "@/lib/ai/aicfo-agent";
import { createClient } from "@/lib/supabase/server";

export const maxDuration = 120;

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) {
    return Response.json({ error: "No autenticado" }, { status: 401 });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json(
      { error: "Falta configurar ANTHROPIC_API_KEY" },
      { status: 503 },
    );
  }

  const { messages } = await req.json();

  return createAgentUIStreamResponse({
    agent: createAicfoAgent(),
    uiMessages: messages,
  });
}
