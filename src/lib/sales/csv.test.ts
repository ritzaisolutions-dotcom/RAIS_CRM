import { describe, expect, it } from "vitest";
import { buildCsv, csvCell } from "./csv";

describe("csvCell", () => {
  it("umschliesst jeden Wert mit Anführungszeichen", () => {
    expect(csvCell("Meier GmbH")).toBe('"Meier GmbH"');
  });

  it("verdoppelt eingebettete Anführungszeichen", () => {
    expect(csvCell('Meier "Immo" GmbH')).toBe('"Meier ""Immo"" GmbH"');
  });

  it("hält Trennzeichen und Zeilenumbrüche im Feld", () => {
    expect(csvCell("Zeile1\r\nZeile2;mehr")).toBe('"Zeile1\r\nZeile2;mehr"');
  });

  it.each(["=1+1", "+49 170 1234567", "-2", "@example", "\tTab", "\rCR"])(
    "entwertet die Formel-Einleitung %j",
    (input) => {
      expect(csvCell(input)).toBe(`"'${input}"`);
    },
  );

  it("entschärft eine echte Formel-Injection", () => {
    // Ohne führenden Apostroph würde Excel das beim Öffnen ausführen.
    // Einfache Anführungszeichen im Wert bleiben unverändert — CSV verdoppelt
    // nur doppelte.
    expect(csvCell("=cmd|'/c calc'!A1")).toBe("\"'=cmd|'/c calc'!A1\"");
  });

  it("lässt harmlose Werte unverändert", () => {
    expect(csvCell("Müller & Söhne")).toBe('"Müller & Söhne"');
    expect(csvCell(42)).toBe('"42"');
  });

  it("bildet null und undefined als leeres Feld ab", () => {
    expect(csvCell(null)).toBe('""');
    expect(csvCell(undefined)).toBe('""');
  });
});

describe("buildCsv", () => {
  const columns = [
    { header: "Firma", get: (r: { a: string; b: number | null }) => r.a },
    { header: "Anfragen", get: (r: { a: string; b: number | null }) => r.b },
  ];

  it("schreibt BOM, Kopfzeile und Semikolon-getrennte Zeilen", () => {
    const csv = buildCsv([{ a: "Alpha", b: 3 }], columns);
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv).toBe('﻿"Firma";"Anfragen"\r\n"Alpha";"3"\r\n');
  });

  it("liefert bei leerer Liste nur die Kopfzeile", () => {
    expect(buildCsv([], columns)).toBe('﻿"Firma";"Anfragen"\r\n');
  });

  it("maskiert auch Werte in den Datenzeilen", () => {
    const csv = buildCsv([{ a: "=BÖSE()", b: null }], columns);
    expect(csv).toContain('"\'=BÖSE()"');
  });
});
