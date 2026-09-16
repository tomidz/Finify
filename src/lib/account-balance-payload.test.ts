import { describe, expect, it } from "vitest";

import { accountBalancePayload } from "./account-balance-payload";

const stored = { opening_amount: 1500, opening_base_amount: 1.25 };

describe("accountBalancePayload", () => {
  it("always sends the balance when creating", () => {
    expect(
      accountBalancePayload({
        mode: "create",
        values: { initial_amount: "1.500", exchange_rate: "0,0008", base_amount: "1,2" },
      }),
    ).toEqual({ initial_amount: 1500, exchange_rate: 0.0008, base_amount: 1.2 });
  });

  it("sends nothing when the balance fields were not edited", () => {
    expect(
      accountBalancePayload({
        mode: "edit",
        values: { initial_amount: "", exchange_rate: "1", base_amount: "" },
        stored: null,
        edited: false,
      }),
    ).toEqual({});
  });

  it("sends nothing when an edit ends on the stored balance", () => {
    expect(
      accountBalancePayload({
        mode: "edit",
        values: { initial_amount: "1.500", exchange_rate: "0,00083333", base_amount: "1,25" },
        stored,
        edited: true,
      }),
    ).toEqual({});
  });

  it("sends the new balance when the user changed it", () => {
    expect(
      accountBalancePayload({
        mode: "edit",
        values: { initial_amount: "2.000", exchange_rate: "0,0008", base_amount: "1,6" },
        stored,
        edited: true,
      }),
    ).toEqual({ initial_amount: 2000, exchange_rate: 0.0008, base_amount: 1.6 });
  });

  it("sends an explicit zero the user typed", () => {
    expect(
      accountBalancePayload({
        mode: "edit",
        values: { initial_amount: "0", exchange_rate: "1", base_amount: "0" },
        stored,
        edited: true,
      }),
    ).toEqual({ initial_amount: 0, exchange_rate: 1, base_amount: 0 });
  });

  it("sends an edited balance even when the stored one could not be loaded", () => {
    expect(
      accountBalancePayload({
        mode: "edit",
        values: { initial_amount: "10", exchange_rate: "1", base_amount: "10" },
        stored: null,
        edited: true,
      }),
    ).toEqual({ initial_amount: 10, exchange_rate: 1, base_amount: 10 });
  });
});
