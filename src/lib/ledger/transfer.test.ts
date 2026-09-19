import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { buildTransferLines, transferRatesNeeded } from "./transfer";

const usd = (id: string) => ({ id, currency: "USD" });
const ars = (id: string) => ({ id, currency: "ARS" });
const eur = (id: string) => ({ id, currency: "EUR" });
const btc = (id: string) => ({ id, currency: "BTC" });

describe("transferRatesNeeded", () => {
  it.each([
    ["base to base", usd("a"), usd("b"), { source: false, destination: false }],
    ["base to foreign", usd("a"), ars("b"), { source: false, destination: true }],
    ["foreign to base", ars("a"), usd("b"), { source: true, destination: false }],
    ["same foreign currency", ars("a"), ars("b"), { source: true, destination: false }],
    ["two foreign currencies", ars("a"), eur("b"), { source: true, destination: true }],
  ])("%s", (_label, source, destination, expected) => {
    expect(transferRatesNeeded({ source, destination, baseCurrency: "USD" })).toEqual(expected);
  });
});

describe("buildTransferLines", () => {
  it("debits the transfer plus the fee and credits the converted amount", () => {
    expect(
      buildTransferLines({
        source: usd("a"),
        destination: ars("b"),
        baseCurrency: "USD",
        sourceAmount: 100,
        destinationAmount: 120_000,
        exchangeRate: 1200,
        fee: 5,
        rates: { destination: 1 / 1250 },
      }),
    ).toEqual([
      { account_id: "a", amount: -105, exchange_rate: 1200, base_amount: -105 },
      { account_id: "b", amount: 120_000, exchange_rate: 1200, base_amount: 96 },
    ]);
  });

  it("values a same-currency destination as its share of the source's base value", () => {
    const [source, destination] = buildTransferLines({
      source: ars("a"),
      destination: ars("b"),
      baseCurrency: "USD",
      sourceAmount: 1000,
      destinationAmount: 1000,
      exchangeRate: 1,
      fee: 10,
      rates: { source: 0.001 },
    });
    expect(source.base_amount).toBeCloseTo(-1.01, 10);
    expect(destination.base_amount).toBeCloseTo(1, 10);
  });

  it("ignores the sign of the inputs and a negative fee", () => {
    const lines = buildTransferLines({
      source: usd("a"),
      destination: usd("b"),
      baseCurrency: "USD",
      sourceAmount: -100,
      destinationAmount: -100,
      exchangeRate: 1,
      fee: -3,
      rates: {},
    });
    expect(lines.map((l) => l.amount)).toEqual([-100, 100]);
  });

  it("fails loudly when a needed rate is missing", () => {
    expect(() =>
      buildTransferLines({
        source: ars("a"),
        destination: usd("b"),
        baseCurrency: "USD",
        sourceAmount: 1000,
        destinationAmount: 1,
        exchangeRate: 1000,
        fee: 0,
        rates: {},
      }),
    ).toThrow(/missing rate/);
  });

  it("in base terms, the legs differ exactly by the fee for same-currency transfers", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 10_000_000 }),
        fc.integer({ min: 0, max: 100_000 }),
        fc.double({ min: 0.0001, max: 10_000, noNaN: true }),
        (amountCents, feeCents, rate) => {
          const amount = amountCents / 100;
          const fee = feeCents / 100;
          const [source, destination] = buildTransferLines({
            source: ars("a"),
            destination: ars("b"),
            baseCurrency: "USD",
            sourceAmount: amount,
            destinationAmount: amount,
            exchangeRate: 1,
            fee,
            rates: { source: rate },
          });
          expect(source.base_amount + destination.base_amount).toBeCloseTo(-fee * rate, 6);
        },
      ),
    );
  });

  // B15: the server trusts the destination amount even when both accounts share
  // a currency, so a client that rounds it loses units. Fixed in Fase 3.
  it.fails("credits exactly the transferred units between accounts in the same currency", () => {
    const [, destination] = buildTransferLines({
      source: btc("a"),
      destination: btc("b"),
      baseCurrency: "USD",
      sourceAmount: 0.12345678,
      destinationAmount: 0.12,
      exchangeRate: 1,
      fee: 0,
      rates: { source: 60_000 },
    });
    expect(destination.amount).toBe(0.12345678);
  });
});
