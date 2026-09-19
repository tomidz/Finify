import { describe, expect, it } from "vitest";

import {
  ActionError,
  errorMessage,
  isTransportError,
  STALE_CLIENT,
  TRANSPORT_FAILURE,
  UNEXPECTED_FAILURE,
  unwrapResult,
} from "./action-result";

describe("unwrapResult", () => {
  it("returns the data, or throws the action's message", () => {
    expect(unwrapResult({ data: 3 })).toBe(3);
    expect(() => unwrapResult({ error: "No autenticado" })).toThrow(new ActionError("No autenticado"));
  });
});

describe("errorMessage", () => {
  it("shows the action's own message", () => {
    expect(errorMessage(new ActionError("Cuenta no encontrada"))).toBe("Cuenta no encontrada");
  });

  it("replaces the browser's words for a request that never got an answer", () => {
    expect(errorMessage(new TypeError("Failed to fetch"))).toBe(TRANSPORT_FAILURE);
    expect(errorMessage(new TypeError("Load failed"))).toBe(TRANSPORT_FAILURE);
    expect(errorMessage(new Error("An unexpected response was received from the server."))).toBe(TRANSPORT_FAILURE);
    expect(isTransportError(new ActionError("Failed to fetch"))).toBe(false);
  });

  it("never shows a technical message", () => {
    expect(errorMessage(new Error("An error occurred in the Server Components render."))).toBe(UNEXPECTED_FAILURE);
    expect(errorMessage(new TypeError("Cannot read properties of undefined (reading 'id')"))).toBe(UNEXPECTED_FAILURE);
    expect(errorMessage("x")).toBe(UNEXPECTED_FAILURE);
  });

  it("asks a tab from before a deploy to reload", () => {
    const stale = Object.assign(new Error('Server Action "abc" was not found on the server.'), {
      name: "UnrecognizedActionError",
    });
    expect(errorMessage(stale)).toBe(STALE_CLIENT);
  });
});
