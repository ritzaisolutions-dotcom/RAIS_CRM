import { describe, expect, it } from "vitest";
import { BUSINESS_TZ, businessToday, rangeBounds } from "./dates";

/** Zivil-Datum eines Instants in Geschäftszeitzone, für Assertions. */
function berlinYmd(iso: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: BUSINESS_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

function berlinWeekday(iso: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: BUSINESS_TZ,
    weekday: "long",
  }).format(new Date(iso));
}

describe("businessToday", () => {
  it("liefert den deutschen Kalendertag, nicht den UTC-Tag (Winterzeit)", () => {
    // 23:30 UTC = 00:30 Berlin am Folgetag. Das alte
    // `toISOString().slice(0, 10)` hätte hier den Vortag geliefert und
    // "fällig heute" auf den falschen Tag abgefragt.
    const instant = new Date("2026-01-15T23:30:00Z");
    expect(businessToday(instant)).toBe("2026-01-16");
    expect(instant.toISOString().slice(0, 10)).toBe("2026-01-15");
  });

  it("liefert den deutschen Kalendertag auch in der Sommerzeit", () => {
    // Im Sommer ist Berlin UTC+2, die Lücke ist also zwei Stunden breit.
    const instant = new Date("2026-07-15T22:30:00Z");
    expect(businessToday(instant)).toBe("2026-07-16");
    expect(instant.toISOString().slice(0, 10)).toBe("2026-07-15");
  });

  it("stimmt mitten am Tag mit dem UTC-Datum überein", () => {
    expect(businessToday(new Date("2026-05-20T12:00:00Z"))).toBe("2026-05-20");
  });
});

describe("rangeBounds", () => {
  it("setzt Tagesgrenzen auf Mitternacht Berliner Winterzeit (UTC+1)", () => {
    const { from, to } = rangeBounds("day", new Date("2026-01-15T23:30:00Z"));
    expect(from).toBe("2026-01-15T23:00:00.000Z");
    expect(to).toBe("2026-01-16T23:00:00.000Z");
  });

  it("setzt Tagesgrenzen auf Mitternacht Berliner Sommerzeit (UTC+2)", () => {
    const { from, to } = rangeBounds("day", new Date("2026-07-15T22:30:00Z"));
    expect(from).toBe("2026-07-15T22:00:00.000Z");
    expect(to).toBe("2026-07-16T22:00:00.000Z");
  });

  it("beginnt die Woche montags um Mitternacht", () => {
    const { from, to } = rangeBounds("week", new Date("2026-08-20T09:00:00Z"));
    expect(berlinWeekday(from)).toBe("Monday");
    expect(berlinWeekday(to)).toBe("Monday");
    // Woche ohne Zeitumstellung: exakt sieben Tage.
    expect(new Date(to).getTime() - new Date(from).getTime()).toBe(
      7 * 24 * 60 * 60 * 1000,
    );
  });

  it("umfasst beim Monat den ersten bis zum ersten des Folgemonats", () => {
    const { from, to } = rangeBounds("month", new Date("2026-08-20T09:00:00Z"));
    expect(berlinYmd(from)).toBe("2026-08-01");
    expect(berlinYmd(to)).toBe("2026-09-01");
  });

  it("rollt am Monatsende korrekt in den Folgemonat", () => {
    const { from, to } = rangeBounds("day", new Date("2026-08-31T09:00:00Z"));
    expect(berlinYmd(from)).toBe("2026-08-31");
    expect(berlinYmd(to)).toBe("2026-09-01");
  });

  it("rollt an Silvester korrekt ins Folgejahr", () => {
    const { from, to } = rangeBounds("day", new Date("2026-12-31T09:00:00Z"));
    expect(berlinYmd(from)).toBe("2026-12-31");
    expect(berlinYmd(to)).toBe("2027-01-01");
  });

  it("umfasst beim Jahr den 1. Januar bis zum 1. Januar des Folgejahres", () => {
    const { from, to } = rangeBounds("year", new Date("2026-08-20T09:00:00Z"));
    expect(berlinYmd(from)).toBe("2026-01-01");
    expect(berlinYmd(to)).toBe("2027-01-01");
  });

  it("überspannt die Sommerzeit-Umstellung ohne Mitternacht zu verlieren", () => {
    // Die Umstellung 2026 liegt am 29.03.; der Monat März enthält sie.
    const { from, to } = rangeBounds("month", new Date("2026-03-15T09:00:00Z"));
    expect(berlinYmd(from)).toBe("2026-03-01");
    expect(berlinYmd(to)).toBe("2026-04-01");
    // 31 Tage minus die verlorene Stunde der Zeitumstellung.
    expect(new Date(to).getTime() - new Date(from).getTime()).toBe(
      31 * 24 * 60 * 60 * 1000 - 60 * 60 * 1000,
    );
  });

  it("liefert halboffene Intervalle: das Ende ist exklusiv", () => {
    const { from, to } = rangeBounds("day", new Date("2026-05-20T12:00:00Z"));
    expect(new Date(from).getTime()).toBeLessThan(new Date(to).getTime());
    expect(berlinYmd(from)).toBe("2026-05-20");
    expect(berlinYmd(to)).toBe("2026-05-21");
  });
});
