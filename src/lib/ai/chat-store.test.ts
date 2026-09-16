import { beforeEach, describe, expect, it, vi } from "vitest";

import { argsOf, fakeSupabase, type RecordedQuery } from "../../../tests/support/fake-supabase";
import { logAiUsage } from "./chat-store";

const usage = {
  userId: "user-1",
  sessionId: "session-1",
  inputTokens: 1_000,
  outputTokens: 200,
  cachedInputTokens: 0,
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
