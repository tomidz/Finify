"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { toast } from "sonner";
import { DefaultChatTransport } from "ai";
import type { InferAgentUIMessage } from "ai";
import {
  AlertTriangle,
  History,
  Plus,
  Send,
  Sparkles,
  Trash2,
  Wrench,
  Zap,
} from "lucide-react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

import {
  deleteAiSession,
  extendAiQuota,
  getAiSessions,
  getAiSessionMessages,
  type AiSessionSummary,
} from "@/actions/ai-chat";
import type { AicfoAgent } from "@/lib/ai/aicfo-agent";
import { UNEXPECTED_FAILURE, errorMessage } from "@/lib/action-result";
import { AICFO_STREAM_FAILURE } from "@/lib/ai/model";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { useConfirm } from "@/hooks/use-confirm";
import { cn } from "@/lib/utils";

// Model output never loads remote images: a markdown image is a GET to any
// URL, which can leak whatever the model was steered into putting in it.
const MARKDOWN_COMPONENTS: Components = {
  img: ({ alt }) => (alt ? <span>{alt}</span> : null),
};

type AicfoUIMessage = InferAgentUIMessage<AicfoAgent>;

const TOOL_LABELS: Record<string, string> = {
  get_months: "Leyendo meses",
  get_accounts: "Leyendo cuentas",
  get_account_balance: "Consultando saldo",
  get_period_summary: "Resumiendo el período",
  get_budget_summary: "Analizando presupuesto",
  get_transactions: "Leyendo transacciones",
  get_net_worth: "Analizando patrimonio",
  get_investments: "Leyendo inversiones",
  get_investment_sales: "Leyendo ventas",
  get_forecast: "Proyectando",
  get_savings_goals: "Leyendo metas de ahorro",
  get_pending_recurring: "Revisando recurrentes",
  convert_currency: "Convirtiendo monedas",
  // Tools of earlier versions, still named in saved conversations.
  get_user_preferences: "Leyendo preferencias",
  get_net_worth_evolution: "Analizando patrimonio",
  get_liabilities: "Leyendo deudas",
  get_investment_values: "Valuando portafolio",
};

/** The server accepts up to this many characters per message. */
const MAX_MESSAGE_LENGTH = 4000;

const SUGGESTIONS = [
  "¿Cómo vengo con el presupuesto de este mes?",
  "Analizá mis gastos de los últimos 3 meses",
  "¿Cómo está rindiendo mi portafolio este año?",
  "¿Cuánto creció mi patrimonio neto este año?",
];

type ApiErrorUsage = {
  tokensToday: number;
  dailyCap: number;
  extensionsToday: number;
  maxExtensions: number;
};

type ParsedChatError = {
  message: string;
  code?: string;
  usage?: ApiErrorUsage;
};

// The transport surfaces the raw response body as error.message, so unwrap the
// JSON payload instead of showing it verbatim.
function parseChatError(error: Error): ParsedChatError {
  try {
    const parsed = JSON.parse(error.message) as {
      error?: string;
      code?: string;
      usage?: ApiErrorUsage;
    };
    return {
      message: parsed.error || UNEXPECTED_FAILURE,
      code: parsed.code,
      usage: parsed.usage,
    };
  } catch {
    // Not a response body: the stream's own failure, or the transport's.
    return { message: error.message === AICFO_STREAM_FAILURE ? AICFO_STREAM_FAILURE : errorMessage(error) };
  }
}

const formatTokens = (value: number) => value.toLocaleString("es-AR");

function toolLabel(partType: string): string | null {
  if (!partType.startsWith("tool-")) return null;
  const name = partType.slice("tool-".length);
  return TOOL_LABELS[name] ?? `Consultando ${name}`;
}

export function AicfoChat({
  initialSessions,
  initialSessionsError,
}: {
  initialSessions: AiSessionSummary[];
  /** Why the history could not be read on the server, if it could not. */
  initialSessionsError: string | null;
}) {
  const confirm = useConfirm();
  const [sessions, setSessions] = useState(initialSessions);
  const [sessionsError, setSessionsError] = useState(initialSessionsError);
  const [sessionId, setSessionId] = useState(() => crypto.randomUUID());
  const [initialMessages, setInitialMessages] = useState<AicfoUIMessage[]>([]);
  const [loadingSession, setLoadingSession] = useState(false);

  const refreshSessions = useCallback(async () => {
    const result = await getAiSessions();
    if ("error" in result) {
      setSessionsError(result.error);
      return;
    }
    setSessions(result.data);
    setSessionsError(null);
  }, []);

  const newChat = useCallback(() => {
    setSessionId(crypto.randomUUID());
    setInitialMessages([]);
  }, []);

  const openSession = useCallback(async (id: string) => {
    setLoadingSession(true);
    try {
      const result = await getAiSessionMessages(id);
      if ("error" in result) toast.error(result.error);
      else {
        setInitialMessages(
          result.data.map((row) => ({
            id: row.id,
            role: row.role,
            parts: row.parts as AicfoUIMessage["parts"],
          })),
        );
        setSessionId(id);
      }
    } finally {
      setLoadingSession(false);
    }
  }, []);

  const removeSession = useCallback(
    async (id: string) => {
      const confirmed = await confirm({
        title: "¿Borrar la conversación?",
        description: "Se borran sus mensajes; el uso de IA ya registrado se mantiene.",
        destructive: true,
      });
      if (!confirmed) return;
      const result = await deleteAiSession(id);
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      await refreshSessions();
      if (id === sessionId) {
        setSessionId(crypto.randomUUID());
        setInitialMessages([]);
      }
    },
    [confirm, refreshSessions, sessionId],
  );

  const hasCurrentSession = sessions.some((s) => s.id === sessionId);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex items-center gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" disabled={loadingSession}>
              {loadingSession ? (
                <Spinner className="size-4" />
              ) : (
                <History className="size-4" />
              )}
              Historial
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-72">
            <DropdownMenuLabel>Conversaciones</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {sessionsError ? (
              <DropdownMenuItem onSelect={() => void refreshSessions()}>
                <span className="text-muted-foreground">No se pudo cargar. Reintentar</span>
              </DropdownMenuItem>
            ) : sessions.length === 0 ? (
              <DropdownMenuItem disabled>
                Todavía no hay conversaciones
              </DropdownMenuItem>
            ) : null}
            {sessions.map((session) => (
              <DropdownMenuItem
                key={session.id}
                onSelect={() => void openSession(session.id)}
                className={cn(
                  "flex items-center justify-between gap-2",
                  session.id === sessionId && "bg-accent",
                )}
              >
                <span className="truncate">
                  {session.title ?? "Sin título"}
                </span>
                <button
                  type="button"
                  aria-label="Borrar conversación"
                  className="text-muted-foreground hover:text-destructive shrink-0"
                  onClick={(event) => {
                    event.stopPropagation();
                    event.preventDefault();
                    void removeSession(session.id);
                  }}
                >
                  <Trash2 className="size-3.5" />
                </button>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <Button
          variant="outline"
          size="sm"
          onClick={newChat}
          disabled={!hasCurrentSession && initialMessages.length === 0}
        >
          <Plus className="size-4" />
          Nueva
        </Button>
      </div>

      <ChatPanel
        key={sessionId}
        id={sessionId}
        initialMessages={initialMessages}
        onTurnFinished={refreshSessions}
      />
    </div>
  );
}

function ChatPanel({
  id,
  initialMessages,
  onTurnFinished,
}: {
  id: string;
  initialMessages: AicfoUIMessage[];
  onTurnFinished: () => Promise<void> | void;
}) {
  const { messages, sendMessage, status, error, clearError, regenerate } =
    useChat<AicfoUIMessage>({
      id,
      messages: initialMessages,
      // Only the new message: the server reads the history from the database.
      transport: new DefaultChatTransport({
        api: "/api/aicfo",
        prepareSendMessagesRequest: ({ id, messages, trigger, messageId }) => ({
          body: { id, message: messages.at(-1), trigger, messageId },
        }),
      }),
      onFinish: () => void onTurnFinished(),
    });
  const [input, setInput] = useState("");
  const [extending, setExtending] = useState(false);
  const [extendError, setExtendError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const busy = status === "submitted" || status === "streaming";

  function submit(text: string) {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    void sendMessage({ text: trimmed });
    setInput("");
  }

  async function extendQuota() {
    setExtending(true);
    setExtendError(null);
    try {
      const result = await extendAiQuota();
      if ("error" in result) {
        setExtendError(result.error);
        return;
      }
      clearError();
      await regenerate();
    } catch (e) {
      setExtendError(errorMessage(e));
    } finally {
      setExtending(false);
    }
  }

  return (
    <Card className="flex min-h-0 flex-1 flex-col overflow-hidden py-0">
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
        {messages.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
            <Sparkles className="text-muted-foreground size-8" />
            <p className="text-muted-foreground text-sm">
              Preguntale a tu CFO por gastos, presupuesto, inversiones o
              patrimonio.
            </p>
            <div className="flex max-w-lg flex-wrap justify-center gap-2">
              {SUGGESTIONS.map((suggestion) => (
                <Button
                  key={suggestion}
                  variant="outline"
                  size="sm"
                  className="h-auto whitespace-normal py-1.5 text-xs"
                  onClick={() => submit(suggestion)}
                >
                  {suggestion}
                </Button>
              ))}
            </div>
          </div>
        )}

        {messages.map((message) => (
          <div
            key={message.id}
            className={cn(
              "flex",
              message.role === "user" ? "justify-end" : "justify-start",
            )}
          >
            <div
              className={cn(
                "max-w-[85%] rounded-lg px-3 py-2 text-sm",
                message.role === "user"
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted",
              )}
            >
              {message.parts.map((part, index) => {
                if (part.type === "text") {
                  return message.role === "user" ? (
                    <span key={index} className="whitespace-pre-wrap">
                      {part.text}
                    </span>
                  ) : (
                    <div
                      key={index}
                      className="prose prose-sm dark:prose-invert max-w-none [&_table]:my-2 [&_table]:w-full [&_td]:px-2 [&_td]:py-1 [&_th]:px-2 [&_th]:py-1"
                    >
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        components={MARKDOWN_COMPONENTS}
                      >
                        {part.text}
                      </ReactMarkdown>
                    </div>
                  );
                }
                const label = toolLabel(part.type);
                if (label) {
                  return (
                    <div
                      key={index}
                      className="text-muted-foreground flex items-center gap-1.5 py-0.5 text-xs"
                    >
                      <Wrench className="size-3" />
                      {label}
                    </div>
                  );
                }
                return null;
              })}
            </div>
          </div>
        ))}

        {status === "submitted" && (
          <div className="text-muted-foreground flex items-center gap-2 text-sm">
            <Spinner className="size-4" />
            Pensando…
          </div>
        )}

        {error && (
          <ChatError
            error={error}
            extending={extending}
            extendError={extendError}
            onExtend={extendQuota}
            onRetry={() => {
              clearError();
              void regenerate();
            }}
          />
        )}

        <div ref={bottomRef} />
      </div>

      <form
        className="flex shrink-0 items-center gap-2 border-t p-3"
        onSubmit={(event) => {
          event.preventDefault();
          submit(input);
        }}
      >
        <Input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="Preguntale algo a tu CFO…"
          disabled={busy}
          maxLength={MAX_MESSAGE_LENGTH}
          autoFocus
        />
        <Button type="submit" size="icon" disabled={busy || !input.trim()}>
          {busy ? (
            <Spinner className="size-4" />
          ) : (
            <Send className="size-4" />
          )}
        </Button>
      </form>
    </Card>
  );
}

function ChatError({
  error,
  extending,
  extendError,
  onExtend,
  onRetry,
}: {
  error: Error;
  extending: boolean;
  extendError: string | null;
  onExtend: () => Promise<void>;
  onRetry: () => void;
}) {
  const { message, code, usage } = parseChatError(error);
  const isQuota = code === "daily_token_cap";
  const canExtend =
    isQuota && !!usage && usage.extensionsToday < usage.maxExtensions;

  return (
    <div className="bg-muted/50 space-y-3 rounded-lg border p-3 text-sm">
      <div className="flex items-start gap-2">
        <AlertTriangle className="text-muted-foreground mt-0.5 size-4 shrink-0" />
        <div className="space-y-1">
          <p className="font-medium">{message}</p>
          {isQuota && usage && (
            <p className="text-muted-foreground text-xs">
              Usaste {formatTokens(usage.tokensToday)} de{" "}
              {formatTokens(usage.dailyCap)} tokens hoy.
              {canExtend &&
                ` Podés sumar otra tanda igual (te quedan ${
                  usage.maxExtensions - usage.extensionsToday
                } de ${usage.maxExtensions} ampliaciones hoy).`}
            </p>
          )}
        </div>
      </div>

      {extendError && <p className="text-destructive text-xs">{extendError}</p>}

      <div className="flex gap-2">
        {canExtend && (
          <Button size="sm" disabled={extending} onClick={() => void onExtend()}>
            {extending ? (
              <Spinner className="size-4" />
            ) : (
              <Zap className="size-4" />
            )}
            Ampliar límite y seguir
          </Button>
        )}
        {!isQuota && (
          <Button size="sm" variant="outline" onClick={onRetry}>
            Reintentar
          </Button>
        )}
      </div>
    </div>
  );
}
