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

function parseYmd(ymd: string): { y: number; m: number; d: number } {
  const [y, m, d] = ymd.split("-").map(Number);
  return { y, m, d };
}

function formatYmd(y: number, m: number, d: number): string {
  const iso = new Date(Date.UTC(y, m - 1, d)).toISOString().slice(0, 10);
  return iso;
}

/** ISO weekday 1=Mon … 7=Sun for a civil YMD (UTC noon trick). */
function isoWeekdayYmd(ymd: string): number {
  const { y, m, d } = parseYmd(ymd);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay() || 7;
}

/** Roll Saturday→Monday, Sunday→Monday. Weekdays unchanged. */
export function skipWeekend(ymd: string): string {
  const wd = isoWeekdayYmd(ymd);
  if (wd < 6) return ymd;
  const { y, m, d } = parseYmd(ymd);
  const add = wd === 6 ? 2 : 1;
  return formatYmd(y, m, d + add);
}

/**
 * Add N business days (Mon–Fri) starting from the day after `ymd`
 * when n≥1; n=0 returns skipWeekend(ymd).
 */
export function addBusinessDays(ymd: string, n: number): string {
  let { y, m, d } = parseYmd(skipWeekend(ymd));
  let left = Math.max(0, Math.floor(n));
  if (left === 0) return formatYmd(y, m, d);
  while (left > 0) {
    d += 1;
    const next = formatYmd(y, m, d);
    const parts = parseYmd(next);
    y = parts.y;
    m = parts.m;
    d = parts.d;
    if (isoWeekdayYmd(next) <= 5) left -= 1;
  }
  return formatYmd(y, m, d);
}

/** Add N calendar weeks, then skip weekend. */
export function addCalendarWeeksSkipWeekend(
  ymd: string,
  weeks: number,
): string {
  const { y, m, d } = parseYmd(ymd);
  return skipWeekend(formatYmd(y, m, d + Math.floor(weeks) * 7));
}

export type FollowUpPresetId =
  | "d1"
  | "d2"
  | "w1"
  | "w2"
  | "w4"
  | "w6"
  | "w12"
  | "custom";

export const FOLLOW_UP_PRESETS: {
  id: Exclude<FollowUpPresetId, "custom">;
  label: string;
}[] = [
  { id: "d1", label: "Follow-up Morgen" },
  { id: "d2", label: "In 2 Tagen" },
  { id: "w1", label: "Follow-up in 1 Woche" },
  { id: "w2", label: "Follow-up in 2 Wochen" },
  { id: "w4", label: "Follow-up 4 Wochen" },
  { id: "w6", label: "Follow-up 4–6 Wochen" },
  { id: "w12", label: "Follow-up in 12 Wochen" },
];

export function dueFromFollowUpPreset(
  preset: Exclude<FollowUpPresetId, "custom">,
  from: string = businessToday(),
): string {
  switch (preset) {
    case "d1":
      return addBusinessDays(from, 1);
    case "d2":
      return addBusinessDays(from, 2);
    case "w1":
      return addCalendarWeeksSkipWeekend(from, 1);
    case "w2":
      return addCalendarWeeksSkipWeekend(from, 2);
    case "w4":
      return addCalendarWeeksSkipWeekend(from, 4);
    case "w6":
      return addCalendarWeeksSkipWeekend(from, 6);
    case "w12":
      return addCalendarWeeksSkipWeekend(from, 12);
    default: {
      const _exhaustive: never = preset;
      return _exhaustive;
    }
  }
}
