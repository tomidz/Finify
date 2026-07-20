import { createAgentUIStreamResponse } from "ai";
import type { InferAgentUIMessage } from "ai";

import { createAicfoAgent, type AicfoAgent } from "@/lib/ai/aicfo-agent";
import {
  checkAiLimits,
  ensureAiSession,
  logAiUsage,
  saveAiMessage,
} from "@/lib/ai/chat-store";
import { createClient } from "@/lib/supabase/server";

export const maxDuration = 120;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type AicfoUIMessage = InferAgentUIMessage<AicfoAgent>;

function messageText(message: AicfoUIMessage | undefined): string {
  if (!message) return "";
  return message.parts
    .map((part) => (part.type === "text" ? part.text : ""))
    .join(" ")
    .trim();
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return Response.json({ error: "No autenticado" }, { status: 401 });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json(
      { error: "Falta configurar ANTHROPIC_API_KEY" },
      { status: 503 },
    );
  }

  const { messages, id } = (await req.json()) as {
    messages: AicfoUIMessage[];
    id?: string;
  };

  if (!id || !UUID_RE.test(id)) {
    return Response.json({ error: "sessionId inválido" }, { status: 400 });
  }
  const sessionId = id;

  const limits = await checkAiLimits(supabase, user.id);
  if (!limits.ok) {
    return Response.json(
      { error: limits.message, code: limits.code, usage: limits.usage },
      { status: limits.status },
    );
  }

  const lastMessage = messages.at(-1);
  const firstUserText =
    messageText(messages.find((m) => m.role === "user")) || "Conversación";

  const sessionResult = await ensureAiSession(
    supabase,
    user.id,
    sessionId,
    firstUserText,
  );
  if (sessionResult.error) {
    return Response.json(
      { error: "No se pudo crear la conversación" },
      { status: 500 },
    );
  }

  if (lastMessage?.role === "user") {
    await saveAiMessage(supabase, {
      sessionId,
      userId: user.id,
      role: "user",
      parts: lastMessage.parts,
    });
  }

  const agent = createAicfoAgent({
    onUsage: (usage) =>
      logAiUsage(supabase, {
        userId: user.id,
        sessionId,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        cachedInputTokens: usage.cachedInputTokens,
        toolNames: usage.toolNames,
      }),
  });

  return createAgentUIStreamResponse({
    agent,
    uiMessages: messages,
    originalMessages: messages,
    onEnd: async ({ responseMessage }) => {
      await saveAiMessage(supabase, {
        sessionId,
        userId: user.id,
        role: "assistant",
        parts: responseMessage.parts,
      });
    },
  });
}
