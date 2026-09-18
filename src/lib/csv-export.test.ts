import { describe, expect, it } from "vitest";
import fc from "fast-check";

import { buildCsv, type CsvColumn } from "./csv-export";

// RFC 4180 reader for ";"-separated text, to check what a spreadsheet sees.
function readCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        quoted = false;
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ";") {
      row.push(field);
      field = "";
    } else if (ch === "\r" && text[i + 1] === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      i++;
    } else {
      field += ch;
    }
  }
  row.push(field);
  rows.push(row);
  return rows;
}

interface Row {
  description: string;
  amount: number | null;
}

const columns: CsvColumn<Row>[] = [
  { header: "Descripción", value: (row) => row.description },
  { header: "Monto", value: (row) => row.amount },
];

describe("buildCsv", () => {
  it("starts with a BOM and separates with ; and CRLF", () => {
    const csv = buildCsv([{ description: "Café", amount: 1234.5 }], columns);
    expect(csv).toBe("﻿Descripción;Monto\r\nCafé;1234,5");
  });

  it("writes numbers the way Excel es-AR reads them", () => {
    const csv = buildCsv(
      [
        { description: "a", amount: -1234.56 },
        { description: "b", amount: 1e-7 },
        { description: "c", amount: 0.1 + 0.2 },
        { description: "d", amount: -0 },
        { description: "e", amount: Number.NaN },
        { description: "f", amount: null },
        { description: "g", amount: 1e21 },
      ],
      columns,
    );
    expect(readCsv(csv.slice(1)).map((row) => row[1])).toEqual([
      "Monto",
      "-1234,56",
      "0,0000001",
      "0,3",
      "0",
      "",
      "",
      "1000000000000000000000",
    ]);
  });

  it("quotes separators, quotes and line breaks", () => {
    const csv = buildCsv([{ description: 'Pago; "cuota"\n2', amount: 1 }], columns);
    expect(csv.split("\r\n")[1]).toBe('"Pago; ""cuota""\n2";1');
  });

  it("neutralizes text that a spreadsheet would run as a formula", () => {
    const cells = ["=HYPERLINK(1)", "+1", "-1", "@SUM(A1)", "\tx", "\rx"].map(
      (description) => readCsv(buildCsv([{ description, amount: null }], columns).slice(1))[1][0],
    );
    expect(cells).toEqual(["'=HYPERLINK(1)", "'+1", "'-1", "'@SUM(A1)", "'\tx", "'\rx"]);
  });

  it("reads back every text cell, neutralized", () => {
    fc.assert(
      fc.property(fc.array(fc.string({ unit: "binary", maxLength: 12 }), { maxLength: 5 }), (texts) => {
        const rows = readCsv(buildCsv(texts.map((description) => ({ description, amount: 1 })), columns).slice(1));
        expect(rows.slice(1).map((row) => row[0])).toEqual(
          texts.map((text) => (/^[=+\-@\t\r]/.test(text) ? `'${text}` : text)),
        );
      }),
    );
  });
});
