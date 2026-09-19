import { describe, expect, it } from "vitest";
import fc from "fast-check";

import { matchesAllWords } from "./search";

describe("matchesAllWords", () => {
  const holding = ["Bitcoin", "BTC", null, "Binance Café", undefined, "USD"];

  it("matches when every word is in some field", () => {
    expect(matchesAllWords(holding, "btc binance")).toBe(true);
    expect(matchesAllWords(holding, "  coin   usd ")).toBe(true);
    expect(matchesAllWords(holding, "btc galicia")).toBe(false);
  });

  it("ignores case and accents on both sides", () => {
    expect(matchesAllWords(holding, "CAFE")).toBe(true);
    expect(matchesAllWords(["Cafe"], "café")).toBe(true);
    expect(matchesAllWords(["Año nuevo"], "ano")).toBe(true);
  });

  it("does not match a word across two fields", () => {
    expect(matchesAllWords(["Bit", "coin"], "bitcoin")).toBe(false);
  });

  it("matches everything on an empty query", () => {
    expect(matchesAllWords([], "")).toBe(true);
    expect(matchesAllWords([null], "   ")).toBe(true);
  });

  it("matches any piece of a field, in any word order", () => {
    fc.assert(
      fc.property(
        fc.array(fc.string({ minLength: 1 }), { minLength: 1, maxLength: 4 }),
        fc.nat(),
        fc.nat(),
        (fields, pick, start) => {
          const field = fields[pick % fields.length];
          const piece = field.slice(start % field.length).split(/\s+/).filter(Boolean);
          const query = piece.join(" ");
          expect(matchesAllWords(fields, query)).toBe(true);
          expect(matchesAllWords(fields, [...piece].reverse().join(" "))).toBe(true);
        },
      ),
    );
  });
});
