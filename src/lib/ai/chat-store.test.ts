import { beforeEach, describe, expect, it, vi } from "vitest";

import { argsOf, fakeSupabase, type RecordedQuery } from "../../../tests/support/fake-supabase";
import { ensureAiSession, logAiUsage } from "./chat-store";

const usage = {
  userId: "user-1",
  sessionId: "session-1",
  inputTokens: 1_000,
  outputTokens: 200,
  cachedInputTokens: 0,
  cacheWriteTokens: 0,
  toolNames: ["getAccounts"],
};

function client(errors: ({ code: string; message: string } | null)[]) {
  let call = 0;
  const fake = fakeSupabase((_query: RecordedQuery) => ({ data: null, error: errors[call++] ?? null }));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { ...fake, supabase: fake.client as any };
}

const insertedRows = (queries: RecordedQuery[]) =>
  queries.map((q) => argsOf(q, "insert")?.[0] as { session_id: string | null });

describe("logAiUsage", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("records the turn under its session", async () => {
    const { supabase, queries } = client([null]);
    await logAiUsage(supabase, usage);
    expect(insertedRows(queries)).toEqual([expect.objectContaining({ session_id: "session-1", input_tokens: 1_000 })]);
  });

  it("keeps the usage when the session no longer exists", async () => {
    const { supabase, queries } = client([{ code: "23503", message: "fk" }, null]);
    await logAiUsage(supabase, usage);
    expect(insertedRows(queries).map((row) => row.session_id)).toEqual(["session-1", null]);
    expect(console.error).not.toHaveBeenCalled();
  });

  it("logs any other failure without retrying", async () => {
    const { supabase, queries } = client([{ code: "23514", message: "check" }]);
    await logAiUsage(supabase, usage);
    expect(queries).toHaveLength(1);
    expect(console.error).toHaveBeenCalledWith("logAiUsage: insert failed:", "23514", "check");
  });
});

describe("ensureAiSession", () => {
  it("rejects a session id that belongs to someone else", async () => {
    // The insert is skipped as a duplicate, and the update sees no own row.
    const fake = fakeSupabase(() => ({ data: [], error: null }));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await ensureAiSession(fake.client as any, "user-1", "session-1", "Hola");
    expect(result).toEqual({ error: "Conversación no encontrada" });
  });

  it("accepts the user's own session", async () => {
    const fake = fakeSupabase(() => ({ data: [{ id: "session-1" }], error: null }));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(await ensureAiSession(fake.client as any, "user-1", "session-1", "Hola")).toEqual({});
  });
});
