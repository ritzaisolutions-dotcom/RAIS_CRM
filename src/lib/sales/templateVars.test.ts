import { describe, expect, it } from "vitest";
import { buildTemplateContext, listPlaceholders, renderTemplate } from "./templateVars";

const ctx = buildTemplateContext({
  personName: "Herr Dr. Thomas Müller",
  firma: "Müller Immobilien",
  stadt: "Dresden",
  website: "https://mueller-immo.de/",
  absender: "Kevin Ritz",
});

describe("buildTemplateContext", () => {
  it("trennt Vor- und Nachname und ignoriert Anrede/Titel", () => {
    expect(ctx.vorname).toBe("Thomas");
    expect(ctx.nachname).toBe("Müller");
    expect(ctx.website).toBe("mueller-immo.de");
  });

  it("setzt keinen Vornamen bei nur einem Namensteil", () => {
    const c = buildTemplateContext({ personName: "Müller" });
    expect(c.vorname).toBeNull();
    expect(c.nachname).toBe("Müller");
  });
});

describe("renderTemplate", () => {
  it("lässt Vorlagen ohne Platzhalter unverändert", () => {
    const r = renderTemplate("Hallo zusammen,\nkurze Info.", ctx);
    expect(r).toEqual({ text: "Hallo zusammen,\nkurze Info.", missing: [], unknown: [] });
  });

  it("ersetzt Variablen, auch mit Leerzeichen und Großschreibung", () => {
    const r = renderTemplate("Hallo {{ Vorname }}, {{firma}} in {{stadt}}", ctx);
    expect(r.text).toBe("Hallo Thomas, Müller Immobilien in Dresden");
    expect(r.missing).toEqual([]);
  });

  it("nutzt den Fallback bei leerem Wert", () => {
    const r = renderTemplate("Guten Tag {{vorname|zusammen}},", buildTemplateContext({}));
    expect(r.text).toBe("Guten Tag zusammen,");
    expect(r.missing).toEqual([]);
  });

  it("meldet fehlende und unbekannte Platzhalter", () => {
    const r = renderTemplate("{{vorname}} {{telefonnr}}", buildTemplateContext({}));
    expect(r.missing).toEqual(["vorname"]);
    expect(r.unknown).toEqual(["telefonnr"]);
    expect(r.text).toBe("{{vorname}} {{telefonnr}}");
  });
});

describe("listPlaceholders", () => {
  it("findet alle Platzhalter einmalig", () => {
    expect(listPlaceholders("{{firma}} {{Firma}} {{stadt|x}}")).toEqual(["firma", "stadt"]);
  });
});
