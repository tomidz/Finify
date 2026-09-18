import { beforeEach, describe, expect, it, vi } from "vitest";

import { dbError } from "./db-errors";

describe("dbError", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("keeps the words the app's own functions raise for the user", () => {
    expect(dbError("t", { code: "P0001", message: "Una transferencia tiene exactamente dos líneas" }, "x")).toEqual({
      error: "Una transferencia tiene exactamente dos líneas",
    });
  });

  it("tells a missing session from a denied row", () => {
    expect(dbError("t", { code: "42501", message: "No autenticado" }, "x")).toEqual({ error: "No autenticado" });
    expect(dbError("t", { code: "42501", message: 'new row violates row-level security policy for table "accounts"' }, "x")).toEqual({
      error: "No tenés permiso para hacer esto.",
    });
  });

  it("never forwards a database message, which can quote the row", () => {
    const error = { code: "23505", message: 'duplicate key value violates unique constraint "accounts_user_id_name_key"' };
    expect(dbError("t", error, "No se pudo guardar la cuenta")).toEqual({ error: "Ya existe un registro con esos datos." });
    expect(dbError("t", { code: "XX000", message: "internal" }, "No se pudo guardar la cuenta")).toEqual({
      error: "No se pudo guardar la cuenta",
    });
    expect(dbError("t", null, "Falló")).toEqual({ error: "Falló" });
  });

  it("logs one line under its tag, without the row", () => {
    dbError("createAccount", { code: "23505", message: "dup", details: "Key (name)=(Banco) already exists." } as never, "x");
    const line = JSON.parse((console.error as unknown as { mock: { calls: string[][] } }).mock.calls[0][0]);
    expect(line).toEqual({ level: "error", tag: "createAccount", code: "23505", message: "dup" });
  });
});
