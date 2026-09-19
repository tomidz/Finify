import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Every export of a "use server" file is a public POST endpoint: anyone can
 * invoke it with its action id, signed in or not. RLS protects the tables, but
 * not the external APIs and quotas an action may spend, so each exported
 * action must check the session itself. Internal helpers belong in
 * src/lib/server (server-only), not in src/actions.
 */
const ACTIONS_DIR = path.resolve(__dirname, "../src/actions");

// Public on purpose: the currency catalog and the login form itself.
const PUBLIC_ACTIONS = new Set(["getCurrencies", "loginWithPassword"]);

const AUTH_CHECK =
  /\bauth\.getUser\(|\bgetUserId\(|\brequireUser\(|\bgetServerContext\(/;

const TOP_LEVEL =
  /^(export |async function |function |const |let |type |interface |import |\/\*)/;

type ExportedAction = { name: string; body: string };

function exportedActions(source: string): ExportedAction[] {
  const lines = source.split("\n");
  const actions: ExportedAction[] = [];
  for (let i = 0; i < lines.length; i++) {
    const match = /^export async function (\w+)/.exec(lines[i]);
    if (!match) continue;
    // The body runs until the next top-level declaration or comment block.
    let end = i + 1;
    while (end < lines.length && !TOP_LEVEL.test(lines[end])) end++;
    actions.push({ name: match[1], body: lines.slice(i, end).join("\n") });
  }
  return actions;
}

function actionsWithoutAuth(source: string): string[] {
  const actions = exportedActions(source);
  const guarded = new Set(
    actions
      .filter((action) => AUTH_CHECK.test(action.body))
      .map((action) => action.name),
  );
  // An action that delegates to a guarded action of the same file is guarded
  // too (e.g. getOrCreateCurrentMonth → createMonth). Iterate to a fixed point.
  let changed = true;
  while (changed) {
    changed = false;
    for (const action of actions) {
      if (guarded.has(action.name)) continue;
      const delegates = [...guarded].some((name) =>
        new RegExp(`\\b${name}\\(`).test(action.body),
      );
      if (delegates) {
        guarded.add(action.name);
        changed = true;
      }
    }
  }
  return actions
    .filter((action) => !PUBLIC_ACTIONS.has(action.name))
    .filter((action) => !guarded.has(action.name))
    .map((action) => action.name);
}

describe("server actions require a session", () => {
  const files = readdirSync(ACTIONS_DIR).filter(
    (file) => file.endsWith(".ts") && !file.endsWith(".test.ts"),
  );

  it("finds the action files", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files)("%s checks the session in every exported action", (file) => {
    const source = readFileSync(path.join(ACTIONS_DIR, file), "utf8");
    expect(source.startsWith('"use server"')).toBe(true);
    expect(actionsWithoutAuth(source)).toEqual([]);
  });

  it("detects an exported action without a session check", () => {
    const source = [
      '"use server";',
      "",
      "export async function leaky(id: string) {",
      "  return fetch(`https://api.example.com/${id}`);",
      "}",
      "",
      "export async function guarded() {",
      "  const userId = await getUserId();",
      "  return userId;",
      "}",
    ].join("\n");
    expect(actionsWithoutAuth(source)).toEqual(["leaky"]);
  });
});
