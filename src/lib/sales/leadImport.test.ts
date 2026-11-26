import { describe, expect, it } from "vitest";
import { parseCsvTable, prepareRows, suggestMapping, type ParsedTable } from "./leadImport";

describe("parseCsvTable", () => {
  it("erkennt Semikolon (Excel DE) und mehrzeilige Felder", () => {
    const t = parseCsvTable('Firma;Notiz\n"Becker Immo";"Zeile 1\nZeile 2"\n') as ParsedTable;
    expect(t.delimiter).toBe(";");
    expect(t.rows).toEqual([["Becker Immo", "Zeile 1\nZeile 2"]]);
  });

  it("meldet fehlende Datenzeilen", () => {
    expect(parseCsvTable("Firma")).toEqual({ error: expect.any(String) });
  });
});

describe("suggestMapping", () => {
  it("ordnet Notion- und englische Spalten zu", () => {
    const m = suggestMapping(["Firma", "Ansprechpartner", "E-Mail", "Social´s", "Website", "Quelle", "City"]);
    expect(m).toEqual({ 0: "name", 1: "person_name", 2: "email", 3: "", 4: "website", 5: "quelle", 6: "stadt" });
  });

  it("vergibt ein Feld nur einmal", () => {
    expect(suggestMapping(["Firma", "Unternehmen"])).toEqual({ 0: "name", 1: "" });
  });
});

describe("prepareRows", () => {
  const table: ParsedTable = {
    delimiter: ",",
    headers: ["Firma", "Stadt", "E-Mail", "Website"],
    rows: [
      ["Becker Immo", "Leipzig", " Info@Becker.DE ", "becker.de"],
      ["", "Dresden", "x@y.de", ""],
      ["Müller", "Halle", "kaputt", ""],
      ["Becker Immo", "leipzig", "", ""],
    ],
  };
  const rows = prepareRows(table, suggestMapping(table.headers));

  it("bereinigt E-Mail und Website", () => {
    expect(rows[0].row).toEqual({
      name: "Becker Immo",
      stadt: "Leipzig",
      email: "info@becker.de",
      website: "https://becker.de",
    });
    expect(rows[0].issues).toEqual([]);
  });

  it("markiert Probleme", () => {
    expect(rows[1].issues).toContain("missing_name");
    expect(rows[2].issues).toContain("invalid_email");
    expect(rows[3].issues).toContain("duplicate_in_file");
  });
});
