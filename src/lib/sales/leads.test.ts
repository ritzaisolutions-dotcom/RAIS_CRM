import { describe, expect, it } from "vitest";
import {
  daysUntil,
  dueTone,
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
