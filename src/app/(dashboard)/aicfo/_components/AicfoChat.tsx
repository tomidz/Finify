"use client";

import { useEffect, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import type { InferAgentUIMessage } from "ai";
import { Loader2, Send, Sparkles, Wrench } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import type { AicfoAgent } from "@/lib/ai/aicfo-agent";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type AicfoUIMessage = InferAgentUIMessage<AicfoAgent>;

const TOOL_LABELS: Record<string, string> = {
  get_months: "Leyendo meses",
  get_user_preferences: "Leyendo preferencias",
  get_accounts: "Leyendo cuentas",
  get_account_balance: "Consultando saldo",
  get_budget_summary: "Analizando presupuesto",
  get_transactions: "Leyendo transacciones",
  get_net_worth_evolution: "Analizando patrimonio",
  get_liabilities: "Leyendo deudas",
  get_investments: "Leyendo inversiones",
  get_investment_sales: "Leyendo ventas",
  get_investment_values: "Valuando portafolio",
  get_forecast: "Proyectando",
  get_savings_goals: "Leyendo metas de ahorro",
  get_pending_recurring: "Revisando recurrentes",
};

const SUGGESTIONS = [
  "¿Cómo vengo con el presupuesto de este mes?",
  "Analizá mis gastos de los últimos 3 meses",
  "¿Cómo está rindiendo mi portafolio este año?",
  "¿Cuánto creció mi patrimonio neto este año?",
];

function toolLabel(partType: string): string | null {
  if (!partType.startsWith("tool-")) return null;
  const name = partType.slice("tool-".length);
  return TOOL_LABELS[name] ?? `Consultando ${name}`;
}

export function AicfoChat() {
  const { messages, sendMessage, status, error } = useChat<AicfoUIMessage>({
    transport: new DefaultChatTransport({ api: "/api/aicfo" }),
  });
  const [input, setInput] = useState("");
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
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
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
            <Loader2 className="size-4 animate-spin" />
            Pensando…
          </div>
        )}

        {error && (
          <p className="text-destructive text-sm">
            Error: {error.message || "algo salió mal, probá de nuevo."}
          </p>
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
          autoFocus
        />
        <Button type="submit" size="icon" disabled={busy || !input.trim()}>
          {busy ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Send className="size-4" />
          )}
        </Button>
      </form>
    </Card>
  );
}
