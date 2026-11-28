/**
 * Spaltenfilter der Leads-Liste (Dropdowns in den Spaltenköpfen + ICP).
 * Wirken zusätzlich zur gewählten Ansicht: „Neu“ + ICP ja = neue ICP-Leads.
 * Werte stehen in der URL; unbekannte Werte werden ignoriert.
 * Keine Server-Imports hier.
 */
import { addBusinessDays } from "./dates";
import { NICHT_ERREICHT, STATUS_MENU } from "./leads";
import { CRM_OPTIONS, ICP_LABELS, ICP_OPTIONS, type CrmSystem, type Icp, type PipelineStatus } from "./types";

type Opt<K extends string> = { key: K; label: string };

export const ICP_FILTER: Opt<Icp>[] = ICP_OPTIONS.map((k) => ({ key: k, label: ICP_LABELS[k] }));

/** Status-Filter; „Nicht erreicht“ bündelt alle Stufen 1–5. */
export const STATUS_FILTER: Opt<PipelineStatus>[] = STATUS_MENU.map((s) => ({ key: s.value, label: s.label }));

export const WV_FILTER = [
  { key: "ueberfaellig", label: "Überfällig" },
  { key: "heute", label: "Heute" },
  { key: "woche", label: "Nächste 7 Tage" },
  { key: "gesetzt", label: "Gesetzt" },
  { key: "keine", label: "Keine Wiedervorlage" },
] as const;

export const KONTAKTE_FILTER = [
  { key: "0", label: "Noch nie kontaktiert" },
  { key: "1-2", label: "1–2 Kontakte" },
  { key: "3+", label: "3+ Kontakte" },
] as const;

export const AP_FILTER = [
  { key: "email", label: "Mit E-Mail" },
  { key: "tel", label: "Mit Telefon" },
  { key: "ohne_email", label: "Ohne E-Mail" },
  { key: "ohne_person", label: "Ohne Ansprechpartner" },
] as const;

export const CRM_FILTER: Opt<string>[] = [
  ...CRM_OPTIONS.map((c) => ({ key: c, label: c })),
  { key: "leer", label: "Nicht erfasst" },
];

export const LK_FILTER = [
  { key: "nie", label: "Noch nie" },
  { key: "7", label: "Vor mehr als 7 Tagen" },
  { key: "30", label: "Vor mehr als 30 Tagen" },
  { key: "letzte7", label: "In den letzten 7 Tagen" },
] as const;

export type LeadColumnFilters = {
  icp?: Icp;
  status?: PipelineStatus;
  wv?: (typeof WV_FILTER)[number]["key"];
  kontakte?: (typeof KONTAKTE_FILTER)[number]["key"];
  ap?: (typeof AP_FILTER)[number]["key"];
  crm?: CrmSystem | "leer";
  lk?: (typeof LK_FILTER)[number]["key"];
};

/** URL-Parameter je Filter. */
export const COLUMN_FILTER_PARAMS = {
  icp: "icp",
  status: "st",
  wv: "wv",
  kontakte: "kv",
  ap: "ap",
  crm: "crm",
  lk: "lk",
} as const satisfies Record<keyof LeadColumnFilters, string>;

function pick<K extends string>(opts: readonly { key: K }[], raw: string | undefined | null): K | undefined {
  return opts.some((o) => o.key === raw) ? (raw as K) : undefined;
}

export function parseLeadColumnFilters(
  params: Record<string, string | undefined>,
): LeadColumnFilters {
  const P = COLUMN_FILTER_PARAMS;
  const out: LeadColumnFilters = {
    icp: pick(ICP_FILTER, params[P.icp]),
    status: pick(STATUS_FILTER, params[P.status]),
    wv: pick(WV_FILTER, params[P.wv]),
    kontakte: pick(KONTAKTE_FILTER, params[P.kontakte]),
    ap: pick(AP_FILTER, params[P.ap]),
    crm: pick(CRM_FILTER, params[P.crm]) as LeadColumnFilters["crm"],
    lk: pick(LK_FILTER, params[P.lk]),
  };
  for (const k of Object.keys(out) as (keyof LeadColumnFilters)[]) if (!out[k]) delete out[k];
  return out;
}

export function hasColumnFilters(f: LeadColumnFilters): boolean {
  return Object.values(f).some(Boolean);
}

/** Tag `ymd` minus `days` Kalendertage, als ISO-Zeitpunkt Mitternacht UTC. */
function daysAgoIso(today: string, days: number): string {
  const [y, m, d] = today.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d - days)).toISOString();
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Filterable = { eq: any; neq: any; in: any; lt: any; lte: any; gte: any; gt: any; is: any; not: any; or: any };

/** `today` = `businessToday()` (Berlin). */
export function applyLeadColumnFilters<Q extends Filterable>(
  query: Q,
  f: LeadColumnFilters,
  today: string,
): Q {
  let q = query;

  if (f.icp) q = q.eq("icp", f.icp);

  if (f.status) {
    q = f.status === "kein_anschluss_1" ? q.in("status", NICHT_ERREICHT) : q.eq("status", f.status);
  }

  switch (f.wv) {
    case "ueberfaellig":
      q = q.lt("naechster_touch", today);
      break;
    case "heute":
      q = q.eq("naechster_touch", today);
      break;
    case "woche":
      q = q.gte("naechster_touch", today).lte("naechster_touch", addBusinessDays(today, 5));
      break;
    case "gesetzt":
      q = q.not("naechster_touch", "is", null);
      break;
    case "keine":
      q = q.is("naechster_touch", null);
      break;
  }

  switch (f.kontakte) {
    case "0":
      q = q.eq("kontaktversuche", 0).not("status", "in", `(${NICHT_ERREICHT.join(",")})`);
      break;
    case "1-2":
      q = q.gte("kontaktversuche", 1).lte("kontaktversuche", 2);
      break;
    case "3+":
      q = q.gte("kontaktversuche", 3);
      break;
  }

  switch (f.ap) {
    case "email":
      q = q.not("email", "is", null);
      break;
    case "tel":
      q = q.or("tel.not.is.null,firma_telefon.not.is.null");
      break;
    case "ohne_email":
      q = q.is("email", null);
      break;
    case "ohne_person":
      q = q.is("person_id", null);
      break;
  }

  if (f.crm === "leer") q = q.is("crm", null);
  else if (f.crm) q = q.eq("crm", f.crm);

  switch (f.lk) {
    case "nie":
      q = q.is("letzter_kontakt_am", null);
      break;
    case "7":
      q = q.lt("letzter_kontakt_am", daysAgoIso(today, 7));
      break;
    case "30":
      q = q.lt("letzter_kontakt_am", daysAgoIso(today, 30));
      break;
    case "letzte7":
      q = q.gte("letzter_kontakt_am", daysAgoIso(today, 7));
      break;
  }

  return q;
}
