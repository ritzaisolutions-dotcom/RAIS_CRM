/**
 * Statistik-Seite: Zeiträume, Typen und Kennzahlen.
 * Zeitgrenzen nach Europe/Berlin (`businessToday()`), Daten aus `sales.lead_stats()`.
 * Keine Server-Imports hier.
 */
import { businessToday } from "./dates";

export const STATS_RANGES = [
  { key: "4w", label: "4 Wochen", grain: "week" },
  { key: "13w", label: "3 Monate", grain: "week" },
  { key: "6m", label: "6 Monate", grain: "month" },
  { key: "12m", label: "12 Monate", grain: "month" },
] as const;

export type StatsRangeKey = (typeof STATS_RANGES)[number]["key"];
export type StatsGrain = "week" | "month";

export function parseStatsRange(raw: string | undefined | null): StatsRangeKey {
  return STATS_RANGES.some((r) => r.key === raw) ? (raw as StatsRangeKey) : "4w";
}

function toUtc(ymd: string) {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}
function ymd(dt: Date) {
  return dt.toISOString().slice(0, 10);
}

/**
 * Zeitraum [from, to) als Berliner Kalendertage. Wochen beginnen Montag und
 * enden mit der laufenden Woche; Monate beginnen am 1. und enden mit dem laufenden Monat.
 */
export function statsRangeBounds(
  key: StatsRangeKey,
  today: string = businessToday(),
): { from: string; to: string; grain: StatsGrain } {
  const t = toUtc(today);
  if (key === "4w" || key === "13w") {
    const weeks = key === "4w" ? 4 : 13;
    const monday = new Date(t);
    monday.setUTCDate(t.getUTCDate() - ((t.getUTCDay() + 6) % 7));
    const to = new Date(monday);
    to.setUTCDate(monday.getUTCDate() + 7);
    const from = new Date(monday);
    from.setUTCDate(monday.getUTCDate() - 7 * (weeks - 1));
    return { from: ymd(from), to: ymd(to), grain: "week" };
  }
  const months = key === "6m" ? 6 : 12;
  const to = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 1));
  const from = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() - (months - 1), 1));
  return { from: ymd(from), to: ymd(to), grain: "month" };
}

/* ------------------------------------------------------------------ */
/* Daten                                                               */
/* ------------------------------------------------------------------ */

export type StatsTotals = {
  touches: number;
  kontaktiert: number;
  erreicht: number;
  gespraeche: number;
  termine: number;
};

export type StatsBreakdownRow = {
  key: string;
  kontaktiert: number;
  erreicht: number;
  gespraeche: number;
  termine: number;
  touches?: number;
};

export type StatsTrendPoint = {
  b: string;
  call: number;
  email: number;
  dm: number;
  sonstige: number;
  termine: number;
};

export type LeadStats = {
  from: string;
  to: string;
  grain: StatsGrain;
  current: StatsTotals;
  prior: StatsTotals;
  median_tage_bis_termin: number | null;
  termine_mehrkanal: number;
  termine_ohne_kanal: number;
  kanaele: StatsBreakdownRow[];
  quellen: StatsBreakdownRow[];
  icp: StatsBreakdownRow[];
  trend: StatsTrendPoint[];
};

const EMPTY_TOTALS: StatsTotals = { touches: 0, kontaktiert: 0, erreicht: 0, gespraeche: 0, termine: 0 };

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : Number(v) || 0);

function totals(raw: unknown): StatsTotals {
  const r = (raw ?? {}) as Partial<Record<keyof StatsTotals, unknown>>;
  return {
    touches: num(r.touches),
    kontaktiert: num(r.kontaktiert),
    erreicht: num(r.erreicht),
    gespraeche: num(r.gespraeche),
    termine: num(r.termine),
  };
}

function rows(raw: unknown, keyField = "key"): StatsBreakdownRow[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((x: Record<string, unknown>) => ({
    key: String(x[keyField] ?? ""),
    kontaktiert: num(x.kontaktiert),
    erreicht: num(x.erreicht),
    gespraeche: num(x.gespraeche),
    termine: num(x.termine),
    ...(x.touches !== undefined ? { touches: num(x.touches) } : {}),
  }));
}

/** JSON aus `sales.lead_stats()` → typisiert, fehlende Felder als 0. */
export function normalizeLeadStats(raw: unknown, fallback: { from: string; to: string; grain: StatsGrain }): LeadStats {
  const r = (raw ?? {}) as Record<string, unknown>;
  const median = r.median_tage_bis_termin;
  return {
    from: typeof r.from === "string" ? r.from : fallback.from,
    to: typeof r.to === "string" ? r.to : fallback.to,
    grain: r.grain === "month" ? "month" : r.grain === "week" ? "week" : fallback.grain,
    current: r.current ? totals(r.current) : EMPTY_TOTALS,
    prior: r.prior ? totals(r.prior) : EMPTY_TOTALS,
    median_tage_bis_termin: median === null || median === undefined ? null : num(median),
    termine_mehrkanal: num(r.termine_mehrkanal),
    termine_ohne_kanal: num(r.termine_ohne_kanal),
    kanaele: rows(r.kanaele, "kanal"),
    quellen: rows(r.quellen),
    icp: rows(r.icp),
    trend: Array.isArray(r.trend)
      ? r.trend.map((p: Record<string, unknown>) => ({
          b: String(p.b ?? ""),
          call: num(p.call),
          email: num(p.email),
          dm: num(p.dm),
          sonstige: num(p.sonstige),
          termine: num(p.termine),
        }))
      : [],
  };
}

/* ------------------------------------------------------------------ */
/* Kennzahlen                                                          */
/* ------------------------------------------------------------------ */

/** Anteil in Prozent, `null` ohne Nenner. */
export function pct(part: number, whole: number): number | null {
  return whole > 0 ? (100 * part) / whole : null;
}

export function formatPct(v: number | null): string {
  if (v === null) return "—";
  return `${v.toLocaleString("de-DE", { maximumFractionDigits: v < 10 ? 1 : 0 })} %`;
}

/** Touches pro Termin, `null` ohne Termin. */
export function touchesPerTermin(t: Pick<StatsTotals, "touches" | "termine">): number | null {
  return t.termine > 0 ? t.touches / t.termine : null;
}

/** Unter dieser Zahl kontaktierter Leads sind Quoten nur ein grober Hinweis. */
export const SMALL_SAMPLE = 50;

export const KANAL_LABELS: Record<string, string> = {
  call: "Telefon",
  email: "E-Mail",
  dm: "LinkedIn",
  sms: "SMS",
  meeting: "Meeting",
  ohne: "Ohne Kanal",
};

/** Beschriftung eines Zeit-Buckets: „KW 48“ oder „Nov 26“. */
export function bucketLabel(b: string, grain: StatsGrain): string {
  const d = toUtc(b);
  if (grain === "month") {
    return d.toLocaleDateString("de-DE", { month: "short", year: "2-digit", timeZone: "UTC" });
  }
  // ISO-Kalenderwoche
  const t = new Date(d);
  t.setUTCDate(t.getUTCDate() + 3 - ((t.getUTCDay() + 6) % 7));
  const jan4 = new Date(Date.UTC(t.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(((t.getTime() - jan4.getTime()) / 86_400_000 - 3 + ((jan4.getUTCDay() + 6) % 7)) / 7);
  return `KW ${week}`;
}
