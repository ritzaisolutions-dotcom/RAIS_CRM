import { describe, expect, it } from "vitest";
import { bucketLabel, normalizeLeadStats, pct, statsRangeBounds, touchesPerTermin } from "./stats";

describe("statsRangeBounds", () => {
  it("4 Wochen: Montag vor 3 Wochen bis Montag nach der laufenden Woche", () => {
    // 28.11.2026 ist ein Samstag
    expect(statsRangeBounds("4w", "2026-11-28")).toEqual({ from: "2026-11-02", to: "2026-11-30", grain: "week" });
  });

  it("Montag selbst gehört zur laufenden Woche", () => {
    expect(statsRangeBounds("4w", "2026-11-30")).toEqual({ from: "2026-11-09", to: "2026-12-07", grain: "week" });
  });

  it("12 Monate: vom 1. vor 11 Monaten bis zum 1. des nächsten Monats", () => {
    expect(statsRangeBounds("12m", "2026-11-28")).toEqual({ from: "2025-12-01", to: "2026-12-01", grain: "month" });
  });
});

describe("Kennzahlen", () => {
  it("pct ohne Nenner ist null", () => {
    expect(pct(3, 0)).toBeNull();
    expect(pct(1, 4)).toBe(25);
  });

  it("Touches pro Termin", () => {
    expect(touchesPerTermin({ touches: 40, termine: 4 })).toBe(10);
    expect(touchesPerTermin({ touches: 40, termine: 0 })).toBeNull();
  });

  it("ISO-Kalenderwoche", () => {
    expect(bucketLabel("2026-11-23", "week")).toBe("KW 48");
    expect(bucketLabel("2026-12-28", "week")).toBe("KW 53");
    expect(bucketLabel("2027-01-04", "week")).toBe("KW 1");
  });
});

describe("normalizeLeadStats", () => {
  it("füllt fehlende Felder mit 0 und liest Kanal-Schlüssel", () => {
    const s = normalizeLeadStats(
      { current: { touches: "5" }, kanaele: [{ kanal: "call", kontaktiert: 2, termine: 1, touches: 5 }] },
      { from: "2026-11-02", to: "2026-11-30", grain: "week" },
    );
    expect(s.current).toEqual({ touches: 5, kontaktiert: 0, erreicht: 0, gespraeche: 0, termine: 0 });
    expect(s.kanaele[0]).toMatchObject({ key: "call", kontaktiert: 2, termine: 1, touches: 5 });
    expect(s.median_tage_bis_termin).toBeNull();
  });
});
