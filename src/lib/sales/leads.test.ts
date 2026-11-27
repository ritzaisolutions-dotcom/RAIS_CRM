import { describe, expect, it } from "vitest";
import {
  daysUntil,
  dueTone,
  pageItems,
  parseLeadPageSize,
  relativeDueLabel,
  resolveStatusChoice,
  statusLabel,
} from "./leads";

describe("resolveStatusChoice", () => {
  it("zählt Nicht erreicht hoch und bleibt bei 5", () => {
    expect(resolveStatusChoice("kein_anschluss_1", "neu")).toBe("kein_anschluss_1");
    expect(resolveStatusChoice("kein_anschluss_1", "kein_anschluss_1")).toBe("kein_anschluss_2");
    expect(resolveStatusChoice("kein_anschluss_1", "kein_anschluss_4")).toBe("kein_anschluss_5");
    expect(resolveStatusChoice("kein_anschluss_1", "kein_anschluss_5")).toBe("kein_anschluss_5");
  });

  it("lässt andere Status unverändert", () => {
    expect(resolveStatusChoice("callback", "kein_anschluss_3")).toBe("callback");
  });
});

describe("statusLabel", () => {
  it("zeigt die Anzahl der Versuche", () => {
    expect(statusLabel("kein_anschluss_1")).toBe("Nicht erreicht");
    expect(statusLabel("kein_anschluss_3")).toBe("Nicht erreicht · 3×");
    expect(statusLabel("neu")).toBe("Neu");
  });
});

describe("Wiedervorlage-Datum", () => {
  const today = "2026-11-25";
  it("rechnet Tage relativ zu heute", () => {
    expect(daysUntil("2026-11-24", today)).toBe(-1);
    expect(daysUntil("2026-12-02", today)).toBe(7);
  });
  it("beschriftet relativ", () => {
    expect(relativeDueLabel("2026-11-25", today)).toBe("Heute");
    expect(relativeDueLabel("2026-11-26", today)).toBe("Morgen");
    expect(relativeDueLabel("2026-11-20", today)).toBe("seit 5 Tagen");
  });
  it("markiert überfällig", () => {
    expect(dueTone("2026-11-20", today)).toBe("overdue");
    expect(dueTone("2026-11-25", today)).toBe("today");
    expect(dueTone(null, today)).toBe("none");
  });
});

describe("Seiten", () => {
  it("zeigt Lücken um die aktuelle Seite", () => {
    expect(pageItems(5, 32)).toEqual([1, "gap", 4, 5, 6, "gap", 32]);
    expect(pageItems(1, 32)).toEqual([1, 2, "gap", 32]);
    expect(pageItems(32, 32)).toEqual([1, "gap", 31, 32]);
  });

  it("füllt Ein-Seiten-Lücken mit der Zahl", () => {
    expect(pageItems(4, 7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(pageItems(3, 10)).toEqual([1, 2, 3, 4, "gap", 10]);
  });

  it("kleine Seitenzahlen ohne Lücke", () => {
    expect(pageItems(1, 1)).toEqual([1]);
    expect(pageItems(2, 3)).toEqual([1, 2, 3]);
  });

  it("Seitengröße nur 50/100/200", () => {
    expect(parseLeadPageSize("100")).toBe(100);
    expect(parseLeadPageSize(200)).toBe(200);
    expect(parseLeadPageSize("75")).toBe(50);
    expect(parseLeadPageSize("abc")).toBe(50);
    expect(parseLeadPageSize(undefined)).toBe(50);
  });
});
