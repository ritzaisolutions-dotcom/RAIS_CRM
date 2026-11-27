import { describe, expect, it } from "vitest";
import { pageFromMarkdown, parseCsv, parseNotionExport } from "./notionExport";
import { mapRecord, parseNotionDate } from "./notionSync";

const header = "Firma,Stadt,ICP,Call-Status,Nächster Anruf,Last edited time,IS24 URL,Ansprechpartner";
const csv = [
  header,
  'Muster GmbH,Köln,JA,Nicht erreicht,"December 2, 2026","November 25, 2026 7:09 PM",https://www.immobilienscout24.de/anbieter/profil/m/x,"Max Muster, Inhaber"',
  "Raus GmbH,Bonn,RAUS,,,,,",
  '"Mehrzeilig ""GmbH""",Mainz,JA,,,,,"Zeile 1\nZeile 2"',
].join("\n");

describe("parseCsv", () => {
  it("handles quotes, escaped quotes and newlines", () => {
    const rows = parseCsv(`﻿${csv}`);
    expect(rows).toHaveLength(3);
    expect(rows[2]["Firma"]).toBe('Mehrzeilig "GmbH"');
    expect(rows[2]["Ansprechpartner"]).toBe("Zeile 1\nZeile 2");
  });
});

describe("pageFromMarkdown", () => {
  it("extracts id, title and body after the property block", () => {
    const p = pageFromMarkdown(
      "Muster GmbH 0123456789abcdef0123456789abcdef.md",
      "# Muster GmbH\n\nStadt: Köln\nICP: JA\n\n## E-Mail\n\nHallo",
    );
    expect(p).toEqual({ id: "0123456789abcdef0123456789abcdef", title: "Muster GmbH", body: "## E-Mail\n\nHallo", stadt: "Köln" });
  });
});

describe("page linking with duplicate titles", () => {
  it("links a page only to the row with the matching city and only once", () => {
    const twin = [
      "Firma,Stadt,ICP,Call-Status,Nächster Anruf,Last edited time,IS24 URL,Ansprechpartner",
      "Schmitt Immobilien GmbH,Heilbronn,,,,,https://www.immobilienscout24.de/anbieter/profil/h/x,",
      "Schmitt Immobilien GmbH,Frankfurt am Main,JA,,,,https://www.immobilienscout24.de/anbieter/profil/f/x,",
    ].join("\n");
    const res = parseNotionExport([
      { name: "L_all.csv", text: twin },
      { name: "Schmitt Immobilien GmbH 49a66e6bc8408245bdf801bfcd3849a6.md", text: "# Schmitt Immobilien GmbH\n\nStadt: Frankfurt am Main\nICP: JA" },
    ]);
    expect(res.records[0].pageId).toMatch(/^export-/);
    expect(res.records[1].pageId).toBe("49a66e6bc8408245bdf801bfcd3849a6");
  });
});

describe("parseNotionExport", () => {
  it("prefers the _all.csv, keeps every row and links page bodies", () => {
    const res = parseNotionExport([
      { name: "Leads abc.csv", text: header },
      { name: "Leads abc_all.csv", text: csv },
      { name: "Muster GmbH 0123456789abcdef0123456789abcdef.md", text: "# Muster GmbH\n\nICP: JA\n\nNotiz aus Notion" },
    ]);
    expect(res.totalRows).toBe(3);
    expect(res.records.map((r) => r.fields["Firma"])).toEqual(["Muster GmbH", "Raus GmbH", 'Mehrzeilig "GmbH"']);
    expect(res.records[0].pageId).toBe("0123456789abcdef0123456789abcdef");
    expect(res.records[0].body).toBe("Notiz aus Notion");
    expect(res.records[2].pageId).toMatch(/^export-[0-9a-f]{8}$/);
  });

  it("rejects exports without CSV or of another database", () => {
    expect(() => parseNotionExport([{ name: "a.md", text: "# x" }])).toThrow(/Keine CSV/);
    expect(() => parseNotionExport([{ name: "a.csv", text: "Name,Status\nx,y" }])).toThrow(/Firma/);
  });

  it("maps export rows like API pages", () => {
    const [rec] = parseNotionExport([{ name: "a_all.csv", text: csv }]).records;
    const lead = mapRecord(rec, "2026-11-26");
    expect(lead).toMatchObject({
      firma: "Muster GmbH",
      status: "kein_anschluss_1",
      wv: "2026-12-02",
      person: { name: "Max Muster" },
    });
  });
});

describe("parseNotionDate", () => {
  it("reads ISO and English month formats", () => {
    expect(parseNotionDate("2026-12-02")).toBe("2026-12-02");
    expect(parseNotionDate("January 11, 2027")).toBe("2027-01-11");
    expect(parseNotionDate("bald")).toBeNull();
  });
});
