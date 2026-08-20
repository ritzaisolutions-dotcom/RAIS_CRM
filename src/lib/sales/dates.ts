import type { AnalyticsRange } from "@/lib/sales/types";

/**
 * Geschäftszeitzone. Alle Tages- und Periodengrenzen des CRM richten sich
 * hiernach — nicht nach UTC (Server/Vercel) und nicht nach der Zeitzone des
 * Browsers.
 *
 * Vorher wurde überall `new Date().toISOString().slice(0, 10)` benutzt. Das ist
 * das UTC-Datum: zwischen 00:00 und 02:00 deutscher Zeit liefert es den Vortag,
 * womit "fällig heute" den falschen Tag abfragt und Analytics-Perioden um ein
 * bis zwei Stunden verschoben sind.
 */
export const BUSINESS_TZ = "Europe/Berlin";

const ymdFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: BUSINESS_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Heutiges Datum als `YYYY-MM-DD` in Geschäftszeitzone. */
export function businessToday(now: Date = new Date()): string {
  return ymdFormatter.format(now);
}

/** Zivil-Datum (Y/M/D) eines Zeitpunkts in Geschäftszeitzone. */
function businessParts(instant: Date) {
  const [y, m, d] = ymdFormatter.format(instant).split("-").map(Number);
  return { y, m, d };
}

/**
 * Offset der Geschäftszeitzone gegenüber UTC zum gegebenen Zeitpunkt, in ms.
 * Wird pro Zeitpunkt bestimmt, damit Sommer-/Winterzeit korrekt greift.
 */
function tzOffsetMs(instant: Date): number {
  const utc = new Date(instant.toLocaleString("en-US", { timeZone: "UTC" }));
  const local = new Date(
    instant.toLocaleString("en-US", { timeZone: BUSINESS_TZ }),
  );
  return local.getTime() - utc.getTime();
}

/**
 * UTC-Zeitpunkt für Mitternacht des Zivil-Datums in Geschäftszeitzone.
 * Über-/Unterlauf (Tag 0, Monat 13, …) normalisiert `Date.UTC` selbst.
 * Der Offset wird zur Mittagszeit bestimmt, damit die DST-Umstellungsnacht
 * nicht auf eine nicht existierende Stunde fällt.
 */
function businessMidnightUtc(y: number, m: number, d: number): Date {
  const offset = tzOffsetMs(new Date(Date.UTC(y, m - 1, d, 12)));
  return new Date(Date.UTC(y, m - 1, d) - offset);
}

/**
 * Halboffenes Intervall [from, to) für den gewählten Analytics-Zeitraum,
 * als UTC-ISO-Instants — Grenzen liegen auf Mitternacht Berliner Zeit.
 * Woche beginnt montags (ISO-8601).
 */
export function rangeBounds(range: AnalyticsRange, now: Date = new Date()) {
  const { y, m, d } = businessParts(now);
  const fromY = y;
  let fromM = m;
  let fromD = d;
  let toY = y;
  let toM = m;
  let toD = d;

  if (range === "day") {
    toD = d + 1;
  } else if (range === "week") {
    const isoWeekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay() || 7;
    fromD = d - isoWeekday + 1;
    toD = fromD + 7;
  } else if (range === "month") {
    fromD = 1;
    toM = m + 1;
    toD = 1;
  } else {
    fromM = 1;
    fromD = 1;
    toY = y + 1;
    toM = 1;
    toD = 1;
  }

  return {
    from: businessMidnightUtc(fromY, fromM, fromD).toISOString(),
    to: businessMidnightUtc(toY, toM, toD).toISOString(),
  };
}
