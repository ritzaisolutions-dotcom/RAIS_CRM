/**
 * Gemeinsame Lead-Logik für Liste und Detailseite (Client + Server).
 * Keine Server-Imports hier.
 */
import type { Tone } from "../../components/ui/badge";
import {
  addBusinessDays,
  addCalendarWeeksSkipWeekend,
  businessToday,
} from "./dates";
import type { PipelineStatus, Relationship } from "./types";

/* ------------------------------------------------------------------ */
/* Ansichten (linke Unterspalte der Leads-Liste)                       */
/* ------------------------------------------------------------------ */

export const LEAD_VIEWS = [
  { key: "alle", label: "Alle aktiven" },
  { key: "faellig", label: "Heute fällig" },
  { key: "neu", label: "Neu" },
  { key: "nicht_erreicht", label: "Nicht erreicht" },
  { key: "rueckruf", label: "Rückruf" },
  { key: "termin", label: "Termin gebucht" },
  { key: "closing", label: "Closing" },
  { key: "kunden", label: "Kunden" },
  { key: "kein_interesse", label: "Kein Interesse" },
] as const;

export type LeadViewKey = (typeof LEAD_VIEWS)[number]["key"];

export function parseLeadView(raw: string | undefined | null): LeadViewKey {
  return LEAD_VIEWS.some((v) => v.key === raw) ? (raw as LeadViewKey) : "alle";
}

export const NICHT_ERREICHT: PipelineStatus[] = [
  "kein_anschluss_1",
  "kein_anschluss_2",
  "kein_anschluss_3",
  "kein_anschluss_4",
  "kein_anschluss_5",
];

export const LEAD_SORTS = [
  { key: "", label: "Wiedervorlage" },
  { key: "firma", label: "Firma A–Z" },
  { key: "neueste", label: "Zuletzt angelegt" },
  { key: "kontakt", label: "Länger nicht kontaktiert" },
] as const;
export type LeadSortKey = (typeof LEAD_SORTS)[number]["key"];

export function parseLeadSort(raw: string | undefined | null): LeadSortKey {
  return LEAD_SORTS.some((s) => s.key === raw) ? (raw as LeadSortKey) : "";
}

/* ------------------------------------------------------------------ */
/* Status                                                              */
/* ------------------------------------------------------------------ */

/** Einträge im Status-Dropdown — „Nicht erreicht" gebündelt. */
export const STATUS_MENU: { value: PipelineStatus; label: string }[] = [
  { value: "neu", label: "Neu" },
  { value: "kein_anschluss_1", label: "Nicht erreicht" },
  { value: "callback", label: "Rückruf" },
  { value: "set_appointment", label: "Termin gebucht" },
  { value: "closed", label: "Closing" },
  { value: "kunde", label: "Kunde" },
  { value: "disqualified", label: "Kein Interesse" },
];

export function nichtErreichtCount(status: PipelineStatus | null | undefined) {
  if (!status) return 0;
  const i = NICHT_ERREICHT.indexOf(status);
  return i === -1 ? 0 : i + 1;
}

/**
 * Wer „Nicht erreicht" wählt, zählt hoch: 1 → 2 → … → 5 (bleibt bei 5).
 * Alle anderen Status bleiben, wie sie sind.
 */
export function resolveStatusChoice(
  choice: PipelineStatus,
  current: PipelineStatus | null | undefined,
): PipelineStatus {
  if (choice !== "kein_anschluss_1") return choice;
  const n = nichtErreichtCount(current);
  return NICHT_ERREICHT[Math.min(n, NICHT_ERREICHT.length - 1)];
}

export function statusLabel(status: PipelineStatus | null | undefined): string {
  if (!status) return "—";
  const n = nichtErreichtCount(status);
  if (n > 0) return n > 1 ? `Nicht erreicht · ${n}×` : "Nicht erreicht";
  return STATUS_MENU.find((s) => s.value === status)?.label ?? status;
}

export function statusTone(status: PipelineStatus | null | undefined): Tone {
  switch (status) {
    case "neu":
      return "blue";
    case "callback":
      return "orange";
    case "set_appointment":
      return "violet";
    case "closed":
      return "yellow";
    case "kunde":
      return "green";
    case "disqualified":
      return "red";
    default:
      return "gray";
  }
}

export function relationshipOf(status: PipelineStatus): Relationship {
  if (status === "kunde") return "Kunde";
  if (status === "disqualified") return "Ausgeschlossen";
  return "Prospect";
}

/* ------------------------------------------------------------------ */
/* Wiedervorlage                                                       */
/* ------------------------------------------------------------------ */

export const FOLLOW_UP_QUICK: { key: string; label: string; due: (from: string) => string }[] = [
  { key: "d1", label: "Morgen", due: (f) => addBusinessDays(f, 1) },
  { key: "d3", label: "In 3 Tagen", due: (f) => addBusinessDays(f, 3) },
  { key: "w1", label: "In 1 Woche", due: (f) => addCalendarWeeksSkipWeekend(f, 1) },
  { key: "w2", label: "In 2 Wochen", due: (f) => addCalendarWeeksSkipWeekend(f, 2) },
  { key: "w6", label: "In 6 Wochen", due: (f) => addCalendarWeeksSkipWeekend(f, 6) },
  { key: "w12", label: "In 12 Wochen", due: (f) => addCalendarWeeksSkipWeekend(f, 12) },
];

function ymdToUtc(ymd: string) {
  const [y, m, d] = ymd.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

/** Tage von heute (Berlin) bis `ymd`; negativ = überfällig. */
export function daysUntil(ymd: string, today: string = businessToday()): number {
  return Math.round((ymdToUtc(ymd) - ymdToUtc(today)) / 86_400_000);
}

const WEEKDAY = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];

export function formatDateDe(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const wd = WEEKDAY[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${wd}, ${String(d).padStart(2, "0")}.${String(m).padStart(2, "0")}.${String(y).slice(2)}`;
}

/** „Heute", „Morgen", „in 5 Tagen", „seit 3 Tagen" … */
export function relativeDueLabel(ymd: string, today: string = businessToday()): string {
  const n = daysUntil(ymd, today);
  if (n === 0) return "Heute";
  if (n === 1) return "Morgen";
  if (n === -1) return "Gestern";
  if (n < 0) return `seit ${-n} Tagen`;
  if (n < 14) return `in ${n} Tagen`;
  if (n < 70) return `in ${Math.round(n / 7)} Wochen`;
  return formatDateDe(ymd);
}

export function dueTone(ymd: string | null, today: string = businessToday()): "overdue" | "today" | "future" | "none" {
  if (!ymd) return "none";
  const n = daysUntil(ymd, today);
  if (n < 0) return "overdue";
  if (n === 0) return "today";
  return "future";
}

/** „vor 3 Tagen" für Zeitstempel (letzter Kontakt). */
export function relativePast(iso: string | null, now: Date = new Date()): string {
  if (!iso) return "—";
  const diff = now.getTime() - new Date(iso).getTime();
  const min = Math.round(diff / 60_000);
  if (min < 1) return "gerade eben";
  if (min < 60) return `vor ${min} Min.`;
  const h = Math.round(min / 60);
  if (h < 24) return `vor ${h} Std.`;
  const d = Math.round(h / 24);
  if (d < 30) return d === 1 ? "gestern" : `vor ${d} Tagen`;
  const mo = Math.round(d / 30);
  return mo < 12 ? `vor ${mo} Mon.` : `vor ${Math.round(mo / 12)} J.`;
}

/* ------------------------------------------------------------------ */
/* Links                                                               */
/* ------------------------------------------------------------------ */

export function normalizeUrl(raw: string | null | undefined): string | null {
  const v = raw?.trim();
  if (!v) return null;
  return /^https?:\/\//i.test(v) ? v : `https://${v}`;
}

export function displayHost(raw: string | null | undefined): string | null {
  const v = raw?.trim();
  if (!v) return null;
  return v.replace(/^https?:\/\//i, "").replace(/^www\./i, "").replace(/\/$/, "");
}
