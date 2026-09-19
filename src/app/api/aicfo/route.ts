import { consumeStream, createAgentUIStreamResponse } from "ai";
import type { FinishReason, InferAgentUIMessage } from "ai";
import { after } from "next/server";
import { z } from "zod";

import { createAicfoAgent, type AicfoAgent, type StepUsage } from "@/lib/ai/aicfo-agent";
import {
  checkAiLimits,
  ensureAiSession,
  logAiUsage,
  saveAiMessage,
} from "@/lib/ai/chat-store";
import { logError } from "@/lib/log";
import { AICFO_STREAM_FAILURE } from "@/lib/ai/model";
import { getServerContext, loadBaseCurrency } from "@/lib/server/context";
import { loadMonths } from "@/lib/server/months";

export const maxDuration = 120;
// The turn ends well before the platform stops the function (a tool's rate
// lookup can take 15 s), so the partial answer and what it spent are saved.
const TURN_TIMEOUT_MS = 90_000;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type AicfoUIMessage = InferAgentUIMessage<AicfoAgent>;

/** The one kind of message a user sends: a single text. */
const UserMessageSchema = z.object({
  id: z.string().min(1).max(100),
  role: z.literal("user"),
  parts: z.array(z.object({ type: z.literal("text"), text: z.string().trim().min(1).max(4000) })).length(1),
});

type ChatRequest = {
  id?: string;
  /** Only the new message: the history is read from the database. */
  message?: unknown;
  /** Sent by a tab still running the previous version. */
  messages?: unknown[];
  trigger?: "submit-message" | "regenerate-message";
};

const TRUNCATED_NOTE = "_(Respuesta cortada antes de terminar.)_";
// "tool-calls" at the end means the step limit stopped the loop mid-way.
const CUT_SHORT: ReadonlySet<FinishReason | undefined> = new Set(["error", "length", "content-filter", "tool-calls"]);

function messageText(message: AicfoUIMessage | undefined): string {
  if (!message) return "";
  return message.parts
    .map((part) => (part.type === "text" ? part.text : ""))
    .join(" ")
    .trim();
}

const FINAL_TOOL_STATES = new Set<string | undefined>(["output-available", "output-error", "output-denied"]);

/**
 * The history as the model gets it. A tool call cut short (an answer that
 * timed out) is left out: the model needs each call with its result. Earlier
 * turns keep what the agent asked, not the data it got back: the answers
 * already summarize it, and resending every result would make each turn cost
 * more than the last.
 */
function forModel(messages: AicfoUIMessage[]): AicfoUIMessage[] {
  const lastUser = messages.findLastIndex((m) => m.role === "user");
  return messages.map(
    (message, index) =>
      ({
        ...message,
        parts: message.parts
          .filter((part) => !part.type.startsWith("tool-") || ("state" in part && FINAL_TOOL_STATES.has(part.state)))
          .map((part) =>
            index < lastUser && part.type.startsWith("tool-") && "output" in part && part.output !== undefined
              ? { ...part, output: "(resultado de un turno anterior: volvé a consultar si lo necesitás)" }
              : part,
          ),
      }) as AicfoUIMessage,
  );
}

export async function POST(req: Request) {
  const ctx = await getServerContext();
  if (!ctx) {
    return Response.json({ error: "No autenticado" }, { status: 401 });
  }
  const { supabase, userId } = ctx;

  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json(
      { error: "Falta configurar ANTHROPIC_API_KEY" },
      { status: 503 },
    );
  }

  let body: ChatRequest;
  try {
    body = (await req.json()) as ChatRequest;
  } catch (e) {
    logError("aicfo", e, { step: "parse request" });
    return Response.json({ error: "Pedido inválido" }, { status: 400 });
  }
  if (!body.id || !UUID_RE.test(body.id)) {
    return Response.json({ error: "sessionId inválido" }, { status: 400 });
  }
  const sessionId = body.id;
  const parsed = UserMessageSchema.safeParse(
    body.message ?? (Array.isArray(body.messages) ? body.messages.at(-1) : undefined),
  );
  if (!parsed.success) {
    return Response.json({ error: "Mensaje inválido" }, { status: 400 });
  }
  const message = parsed.data as AicfoUIMessage;

  const limits = await checkAiLimits(supabase, userId);
  if (!limits.ok) {
    return Response.json(
      { error: limits.message, code: limits.code, usage: limits.usage },
      { status: limits.status },
    );
  }

  const [months, baseCurrency] = await Promise.all([loadMonths(ctx), loadBaseCurrency(ctx)]);
  if ("error" in months || "error" in baseCurrency) {
    return Response.json({ error: "No se pudieron leer tus datos" }, { status: 500 });
  }

  const sessionResult = await ensureAiSession(
    supabase,
    userId,
    sessionId,
    messageText(message) || "Conversación",
  );
  if (sessionResult.error) {
    return Response.json(
      { error: "No se pudo crear la conversación" },
      { status: 500 },
    );
  }

  const saved = await saveAiMessage(supabase, {
    sessionId,
    userId,
    clientMessageId: message.id,
    role: "user",
    parts: message.parts,
  });
  if (saved.error) {
    return Response.json({ error: "No se pudo guardar el mensaje" }, { status: 500 });
  }

  const { data: rows, error: historyError } = await supabase
    .from("ai_messages")
    .select("id, client_message_id, role, parts")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });
  if (historyError) {
    logError("aicfo", historyError, { step: "history" });
    return Response.json({ error: "No se pudo leer la conversación" }, { status: 500 });
  }
  const stored = rows ?? [];
  const at = stored.findIndex((row) => (row.client_message_id ?? row.id) === message.id);
  if (at === -1) {
    logError("aicfo", "saved message missing from history", { step: "history" });
    return Response.json({ error: "No se pudo leer la conversación" }, { status: 500 });
  }
  // What came after this message is the answer being replaced; a request
  // repeated for a message already answered is not run twice.
  const later = stored.slice(at + 1);
  if (later.length > 0) {
    // Only an answer is replaced: a later question means another tab moved on.
    if (body.trigger !== "regenerate-message" || later.some((row) => row.role === "user")) {
      return Response.json({ error: "Ese mensaje ya tiene respuesta." }, { status: 409 });
    }
    const { error: deleteError } = await supabase
      .from("ai_messages")
      .delete()
      .in(
        "id",
        later.map((row) => row.id),
      );
    if (deleteError) {
      logError("aicfo", deleteError, { step: "replace answer" });
      return Response.json({ error: "No se pudo reemplazar la respuesta" }, { status: 500 });
    }
  }
  // Always ends with the user's message: the model does not continue an
  // answer of its own.
  const history = stored.slice(0, at + 1).map(
    (row) =>
      ({
        id: row.client_message_id ?? row.id,
        role: row.role,
        parts: Array.isArray(row.parts) ? row.parts : [],
      }) as AicfoUIMessage,
  );

  const steps: StepUsage[] = [];
  // Steps the model started answering: a cut one reports no usage, but was
  // billed, and still counts against the limits.
  let stepsStarted = 0;
  const agent = createAicfoAgent(
    { server: ctx, baseCurrency: baseCurrency.data, months: months.data },
    { onStep: (step) => steps.push(step) },
  );

  let ended = false;
  const endTurn = async (
    responseMessage: AicfoUIMessage,
    isAborted: boolean,
    finishReason: FinishReason | undefined,
  ) => {
    if (ended) return;
    ended = true;
    const cutShort = isAborted || CUT_SHORT.has(finishReason);
    const parts = cutShort
      ? [...responseMessage.parts, { type: "text" as const, text: TRUNCATED_NOTE }]
      : responseMessage.parts;
    if (responseMessage.parts.length > 0) {
      const answer = {
        sessionId,
        userId,
        clientMessageId: responseMessage.id,
        role: "assistant" as const,
        parts,
      };
      if ((await saveAiMessage(supabase, answer)).error) await saveAiMessage(supabase, answer);
    }
    // A turn the model never started answering spent nothing and does not
    // count against the hourly limit. The step an abort or a timeout cuts
    // short reports no usage.
    if (stepsStarted === 0) return;
    const total = (pick: (usage: StepUsage["usage"]) => number | undefined) =>
      steps.reduce((sum, step) => sum + (pick(step.usage) ?? 0), 0);
    await logAiUsage(supabase, {
      userId,
      sessionId,
      inputTokens: total((u) => u.inputTokens),
      outputTokens: total((u) => u.outputTokens),
      cachedInputTokens: total((u) => u.inputTokenDetails?.cacheReadTokens),
      cacheWriteTokens: total((u) => u.inputTokenDetails?.cacheWriteTokens),
      toolNames: [...new Set(steps.flatMap((step) => step.toolNames))],
    });
  };

  try {
    return await createAgentUIStreamResponse({
      agent,
      uiMessages: forModel(history),
      originalMessages: history,
      generateMessageId: () => crypto.randomUUID(),
      abortSignal: req.signal,
      timeout: { totalMs: TURN_TIMEOUT_MS },
      experimental_transform: () =>
        new TransformStream({
          transform(part, controller) {
            if (part.type === "start-step") stepsStarted += 1;
            controller.enqueue(part);
          },
        }),
      // Reads the stream to its end even with no client, and keeps the
      // function alive until onEnd has saved the answer.
      consumeSseStream: ({ stream }) => after(consumeStream({ stream })),
      onEnd: ({ responseMessage, isAborted, finishReason }) =>
        endTurn(responseMessage, isAborted, finishReason),
      onError: (error) => {
        logError("aicfo", error, { step: "stream" });
        return AICFO_STREAM_FAILURE;
      },
    });
  } catch (e) {
    logError("aicfo", e, { step: "start turn" });
    return Response.json({ error: "No se pudo leer la conversación" }, { status: 500 });
  }
}
