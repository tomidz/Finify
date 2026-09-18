import { describe, expect, it } from "vitest";

import { filterByKeywords, filterIgnoringAccents } from "./command-filter";

describe("filterByKeywords", () => {
  it("matches on the readable keywords", () => {
    expect(filterByKeywords("6f1b3f5e-8a4b", "galicia", ["Banco Galicia", "ARS", "Tarjeta de crédito"])).toBeGreaterThan(0);
    expect(filterByKeywords("6f1b3f5e-8a4b", "tarjeta", ["Banco Galicia", "ARS", "Tarjeta de crédito"])).toBeGreaterThan(0);
  });

  it("ignores accents", () => {
    expect(filterByKeywords("id", "educacion", ["Educación"])).toBeGreaterThan(0);
    expect(filterIgnoringAccents("Configuración", "configuracion")).toBeGreaterThan(0);
  });

  it("ignores the id used as the item value", () => {
    expect(filterByKeywords("6f1b3f5e-8a4b-4b8e", "8a4b", ["Banco Galicia", "ARS"])).toBe(0);
  });
});
