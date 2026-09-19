import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 0042 takes EXECUTE away from PUBLIC and anon function by function, and
 * default privileges cover the functions later migrations create. A function
 * created up to 0042 but missing from its list would stay callable signed out.
 */
const MIGRATIONS_DIR = path.resolve(__dirname, "../supabase/migrations");
const GRANTS_MIGRATION = "0042_fx_rates_and_rpc_hardening.sql";

const normalize = (sql: string) => sql.replace(/\s+/g, " ").trim().toLowerCase();

const readStatements = (file: string) =>
  readFileSync(path.join(MIGRATIONS_DIR, file), "utf8").replace(/--.*$/gm, "");

/** "p_year integer default null" → "integer" */
function argType(argument: string): string {
  const withoutDefault = normalize(argument).replace(/ default .*$/, "").replace(/ = .*$/, "");
  const [, ...type] = withoutDefault.split(" ");
  return type.join(" ");
}

function createdFunctions(): Set<string> {
  const functions = new Set<string>();
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((file) => file.endsWith(".sql") && file <= GRANTS_MIGRATION)
    .sort();
  for (const file of files) {
    const sql = readStatements(file);
    const creates = /create\s+(?:or\s+replace\s+)?function\s+([\w.]+)\s*\(([^)]*)\)\s*returns/gi;
    for (const match of sql.matchAll(creates)) {
      const args = match[2].trim() === "" ? [] : match[2].split(",").map(argType);
      functions.add(`${match[1].toLowerCase()}(${args.join(", ")})`);
    }
  }
  return functions;
}

function listedIn(statement: "revoke" | "grant"): Set<string> {
  const sql = readStatements(GRANTS_MIGRATION);
  const pattern =
    statement === "revoke"
      ? /revoke execute on function([\s\S]*?)from public, anon;/i
      : /grant execute on function([\s\S]*?)to authenticated, service_role;/i;
  const list = pattern.exec(sql)?.[1] ?? "";
  return new Set(
    [...list.matchAll(/([\w.]+)\(([^)]*)\)/g)].map(
      (match) => `${match[1].toLowerCase()}(${normalize(match[2])})`,
    ),
  );
}

describe("function grants in 0042", () => {
  it("revokes signed-out access to every function created so far", () => {
    expect([...listedIn("revoke")].sort()).toEqual([...createdFunctions()].sort());
  });

  it("grants signed-in access to the same functions", () => {
    expect([...listedIn("grant")].sort()).toEqual([...listedIn("revoke")].sort());
  });
});
