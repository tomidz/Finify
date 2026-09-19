import { describe, expect, it, vi } from "vitest";

import { buildCsv } from "@/lib/csv-export";
import type {
  TransactionAmountWithRelations,
  TransactionWithRelations,
} from "@/types/transactions";

import { fetchAllPages, transactionCsvColumns } from "./transactions-export";

function leg(overrides: Partial<TransactionAmountWithRelations>): TransactionAmountWithRelations {
  return {
    id: "leg",
    transaction_id: "tx",
    account_id: "acc",
    amount: 0,
    original_currency: "ARS",
    exchange_rate: 1,
    base_amount: 0,
    created_at: "2026-09-01T00:00:00Z",
    account_name: "Banco",
    account_currency_symbol: "$",
    ...overrides,
  };
}

function tx(overrides: Partial<TransactionWithRelations>): TransactionWithRelations {
  return {
    id: "tx",
    user_id: "user",
    month_id: "month",
    category_id: null,
    transaction_type: "expense",
    date: "2026-09-15",
    description: "Supermercado",
    notes: null,
    fee: 0,
    created_at: "2026-09-15T00:00:00Z",
    updated_at: "2026-09-15T00:00:00Z",
    category_name: null,
    category_type: null,
    amounts: [],
    ...overrides,
  };
}

describe("fetchAllPages", () => {
  it("asks for every page until there is no next one", async () => {
    const pages = [
      { items: [1, 2], nextOffset: 2 },
      { items: [3, 4], nextOffset: 4 },
      { items: [5], nextOffset: null },
    ];
    const fetchPage = vi.fn(async (offset: number) => pages[offset / 2]);

    await expect(fetchAllPages(fetchPage)).resolves.toEqual([1, 2, 3, 4, 5]);
    expect(fetchPage.mock.calls.map(([offset]) => offset)).toEqual([0, 2, 4]);
  });

  it("returns nothing for an empty first page", async () => {
    await expect(fetchAllPages(async () => ({ items: [], nextOffset: null }))).resolves.toEqual([]);
  });

  it("fails instead of looping when a page does not advance", async () => {
    const fetchPage = vi.fn(async () => ({ items: [1], nextOffset: 0 }));

    await expect(fetchAllPages(fetchPage)).rejects.toThrow();
    expect(fetchPage).toHaveBeenCalledTimes(1);
  });

  it("stops at the first failed page", async () => {
    const fetchPage = vi
      .fn<(offset: number) => Promise<{ items: number[]; nextOffset: number | null }>>()
      .mockResolvedValueOnce({ items: [1], nextOffset: 1 })
      .mockRejectedValueOnce(new Error("boom"));

    await expect(fetchAllPages(fetchPage)).rejects.toThrow("boom");
    expect(fetchPage).toHaveBeenCalledTimes(2);
  });
});

describe("transactionCsvColumns", () => {
  const rows = (items: TransactionWithRelations[], base: string | null = "EUR") =>
    buildCsv(items, transactionCsvColumns(base)).replace(/^﻿/, "").split("\r\n");

  it("has the export's headers, naming the base currency", () => {
    expect(rows([])[0]).toBe(
      "Fecha;Descripción;Tipo;Categoría;Cuenta;Moneda;Monto;Monto en EUR;Cuenta destino;Moneda destino;Monto destino;Comisión;Notas",
    );
    expect(rows([], null)[0]).toContain(";Monto en moneda base;");
  });

  it("writes the primary leg signed, with its current base amount", () => {
    const expense = tx({
      category_name: "Comida",
      notes: "con tarjeta",
      amounts: [leg({ amount: -1234.5, base_amount: -1.2, current_base_amount: -1.25 })],
    });

    expect(rows([expense])[1]).toBe(
      "2026-09-15;Supermercado;Gasto;Comida;Banco;ARS;-1234,5;-1,25;;;;;con tarjeta",
    );
  });

  it("falls back to the stored base amount without a current one", () => {
    const income = tx({
      transaction_type: "income",
      amounts: [leg({ amount: 100, base_amount: 0.1 })],
    });

    expect(rows([income])[1]).toBe("2026-09-15;Supermercado;Ingreso;;Banco;ARS;100;0,1;;;;;");
  });

  it("uses a transfer's source leg, with its destination and fee", () => {
    const transfer = tx({
      transaction_type: "transfer",
      description: "Banco → Broker",
      fee: 1.5,
      amounts: [
        leg({ account_name: "Broker", amount: 50, original_currency: "USD", base_amount: 46 }),
        leg({ account_name: "Banco", amount: -50, original_currency: "USD", base_amount: -46 }),
      ],
    });

    expect(rows([transfer])[1]).toBe(
      "2026-09-15;Banco → Broker;Transferencia;;Banco;USD;-50;-46;Broker;USD;50;1,5;",
    );
  });

  it("leaves the leg columns empty for a transaction without legs", () => {
    expect(rows([tx({})])[1]).toBe("2026-09-15;Supermercado;Gasto;;;;;;;;;;");
  });

  it("keeps crypto precision", () => {
    const buy = tx({
      transaction_type: "income",
      amounts: [leg({ amount: 0.12345678, original_currency: "BTC", base_amount: 7000 })],
    });

    expect(rows([buy])[1]).toContain(";BTC;0,12345678;7000;");
  });
});
