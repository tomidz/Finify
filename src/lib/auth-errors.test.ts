import { describe, expect, it } from "vitest";

import { authErrorMessage } from "./auth-errors";

describe("authErrorMessage", () => {
  it("says what happened in Spanish, by the error's code", () => {
    expect(authErrorMessage({ code: "invalid_credentials" }, "x")).toBe("Email o contraseña incorrectos.");
    expect(authErrorMessage({ code: "something_new" }, "No se pudo iniciar sesión.")).toBe("No se pudo iniciar sesión.");
    expect(authErrorMessage(null, "Falló")).toBe("Falló");
  });
});
