export type Relationship = "Prospect" | "Kunde" | "Ausgeschlossen";

export type MitarbeiterKlasse = "1-2" | "3-5" | "5-25" | "25+" | "unbekannt";

export type CrmSystem =
  | "onOffice"
  | "Propstack"
  | "FlowFact"
  | "FIO Webmakler"
  | "kein CRM"
  | "unbekannt";

export type TouchKanal =
  | "call"
  | "dm"
  | "email"
  | "meeting"
  | "engagement"
  | "status_change";

export type TouchErgebnis =
  | "nicht_erreicht"
  | "erreicht_ohne_gespraech"
  | "disqualifiziert"
  | "gespraech_ohne_termin"
  | "termin_gebucht"
  | "kein_ergebnis";

/** Legacy call pipeline on companies (list Status column) */
export type PipelineStatus =
  | "neu"
  | "kein_anschluss_1"
  | "kein_anschluss_2"
  | "kein_anschluss_3"
  | "kein_anschluss_4"
  | "kein_anschluss_5"
  | "callback"
  | "disqualified"
  | "set_appointment"
  | "closed"
  | "kunde";

export type Abbruchgrund =
  | "zu_klein"
  | "kein_schmerz"
  | "kein_budget"
  | "kein_interesse"
  | "timing";

export type OppVariante = "system_3k" | "system_crm_6k";
export type OppStage = "offen" | "angebot_raus" | "gewonnen" | "verloren";

export type CallListeRow = {
  company_id: string;
  firma: string;
  entscheider: string | null;
  bundesland: string | null;
  crm: CrmSystem | null;
  "anfragen/woche": number | null;
  naechster_touch: string | null;
  status: PipelineStatus | null;
  tage_seit_touch: number | null;
  tel: string | null;
  email: string | null;
  linkedin_url: string | null;
  inserate_aktiv: number | null;
  website: string | null;
  instagram_url: string | null;
  facebook_url: string | null;
};

/** Fälligkeits-Filter der Call-Liste — geteilt von Server-Query und Tabelle. */
export type ListeDueFilter = "" | "today" | "overdue";

/**
 * Sortierung der Liste. `""` = Anruf-Priorität aus der View
 * (überfällig zuerst, dann nächster Touch, dann Anfragen/Woche).
 */
export type ListeSort = "" | "firma" | "faellig" | "tage";

export type ListeColumnId =
  | "Firma"
  | "Entscheider"
  | "Status"
  | "Nächster Touch"
  | "Tage"
  | "Tel"
  | "Email"
  | "Website"
  | "LinkedIn"
  | "Instagram"
  | "Facebook"
  | "CRM"
  | "Anfragen/W";

export const LISTE_COLUMN_CATALOG: ListeColumnId[] = [
  "Firma",
  "Entscheider",
  "Status",
  "Nächster Touch",
  "Tage",
  "Tel",
  "Email",
  "Website",
  "LinkedIn",
  "Instagram",
  "Facebook",
  "CRM",
  "Anfragen/W",
];

export type AnalyticsRange = "day" | "week" | "month" | "year";
export type AnalyticsGrain = "hour" | "day" | "week" | "month";

export type AnalyticsSummaryValues = {
  attempts: number;
  connects: number;
  conversations: number;
  appointments: number;
  connect_rate_pct: number | null;
  appointment_rate_pct: number | null;
};

export type AnalyticsSummary = AnalyticsSummaryValues & {
  dials: number;
  dms: number;
  prior: AnalyticsSummaryValues;
};

export type AnalyticsFunnelKey =
  | "attempts"
  | "connects"
  | "conversations"
  | "appointments";

export type AnalyticsFunnelStep = {
  key: AnalyticsFunnelKey;
  value: number;
  conversion_pct: number | null;
};

export type AnalyticsChannel = {
  channel: "call" | "dm";
  attempts: number;
  connects: number;
  conversations: number;
  appointments: number;
  connect_rate_pct: number | null;
  appointment_rate_pct: number | null;
};

export type AnalyticsTrendPoint = {
  bucket: string;
  dials: number;
  dms: number;
  appointments: number;
};

export type AnalyticsActions = {
  due_today: number;
  overdue: number;
  callbacks: number;
  contacted_today: number;
};

export type AnalyticsCommercial = {
  total_opportunities: number;
  open_opportunities: number;
  open_offers: number;
  won: number;
  lost: number;
  won_setup_revenue: number;
  won_monthly_retainer: number;
  open_setup_value: number;
  close_rate_pct: number | null;
};

export type AnalyticsDashboardData = {
  from: string;
  to: string;
  grain: AnalyticsGrain;
  summary: AnalyticsSummary;
  funnel: AnalyticsFunnelStep[];
  channels: AnalyticsChannel[];
  trend: AnalyticsTrendPoint[];
  actions: AnalyticsActions;
  pipeline: PipelineStatusCount[];
  company_counts: {
    customers: number;
    disqualified: number;
  };
  commercial: AnalyticsCommercial;
};

/** `rangeBounds` lebt in `@/lib/sales/dates` — dort mit Geschäftszeitzone. */

export type Company = {
  id: string;
  name: string;
  stadt: string | null;
  website: string | null;
  instagram_url: string | null;
  facebook_url: string | null;
  telefon: string | null;
  mitarbeiterzahl: MitarbeiterKlasse | null;
  crm_system: CrmSystem | null;
  anfragen_pro_woche: number | null;
  inserate_aktiv: number | null;
  relationship: Relationship;
  /** Freitext-Recherchenotizen zur Firma. */
  recherche: string | null;
  pipeline_status: PipelineStatus;
  created_at: string;
  updated_at: string;
};

export type PipelineStatusCount = {
  status: PipelineStatus;
  n: number;
};

export type Person = {
  id: string;
  company_id: string;
  name: string;
  rolle: string | null;
  email: string | null;
  telefon: string | null;
  linkedin_url: string | null;
  ist_entscheider: boolean;
  created_at: string;
};

export type Touchpoint = {
  id: number;
  company_id: string;
  person_id: string | null;
  kanal: TouchKanal;
  ergebnis: TouchErgebnis;
  abbruchgrund: Abbruchgrund | null;
  notiz: string | null;
  naechster_touch: string | null;
  occurred_at: string;
  created_at: string;
  /** Auth-Nutzer, der den Touch protokolliert hat. NULL bei Altbestand/Import. */
  created_by: string | null;
  /** Gesetzt, wenn der Touch als Fehleingabe storniert wurde. */
  voided_at: string | null;
  voided_by: string | null;
  void_grund: string | null;
};

export type Opportunity = {
  id: string;
  company_id: string;
  variante: OppVariante;
  setup_preis: number | null;
  retainer_monatlich: number | null;
  stage: OppStage;
  close_grund: string | null;
  created_at: string;
  closed_at: string | null;
};

export const MITARBEITER_OPTIONS: MitarbeiterKlasse[] = [
  "1-2",
  "3-5",
  "5-25",
  "25+",
  "unbekannt",
];

export const CRM_OPTIONS: CrmSystem[] = [
  "onOffice",
  "Propstack",
  "FlowFact",
  "FIO Webmakler",
  "kein CRM",
  "unbekannt",
];

export const RELATIONSHIP_OPTIONS: Relationship[] = [
  "Prospect",
  "Kunde",
  "Ausgeschlossen",
];

export const KANAL_OPTIONS: TouchKanal[] = [
  "call",
  "dm",
  "email",
  "meeting",
  "engagement",
  "status_change",
];

export const ERGEBNIS_OPTIONS: TouchErgebnis[] = [
  "nicht_erreicht",
  "erreicht_ohne_gespraech",
  "disqualifiziert",
  "gespraech_ohne_termin",
  "termin_gebucht",
  "kein_ergebnis",
];

export const ERGEBNIS_LABELS: Record<TouchErgebnis, string> = {
  nicht_erreicht: "Nicht erreicht",
  erreicht_ohne_gespraech: "Erreicht ohne Gespräch",
  disqualifiziert: "Disqualifiziert",
  gespraech_ohne_termin: "Gespräch ohne Termin",
  termin_gebucht: "Termin gebucht",
  kein_ergebnis: "Kein Ergebnis",
};

export const KANAL_LABELS: Record<TouchKanal, string> = {
  call: "Call",
  dm: "DM (LinkedIn)",
  email: "E-Mail",
  meeting: "Meeting",
  engagement: "Engagement",
  status_change: "Statusänderung",
};

export const PIPELINE_STATUS_OPTIONS: PipelineStatus[] = [
  "neu",
  "kein_anschluss_1",
  "kein_anschluss_2",
  "kein_anschluss_3",
  "kein_anschluss_4",
  "kein_anschluss_5",
  "callback",
  "disqualified",
  "set_appointment",
  "closed",
  "kunde",
];

export const PIPELINE_STATUS_LABELS: Record<PipelineStatus, string> = {
  neu: "Neu",
  kein_anschluss_1: "Kein Anschluss (1)",
  kein_anschluss_2: "Kein Anschluss (2)",
  kein_anschluss_3: "Kein Anschluss (3)",
  kein_anschluss_4: "Kein Anschluss (4)",
  kein_anschluss_5: "Kein Anschluss (5)",
  callback: "Rückruf",
  disqualified: "Disqualifiziert",
  set_appointment: "Setting",
  closed: "Closing",
  kunde: "Kunde",
};

/** Call | DM for list/status logging (DM increments Analytics LinkedIn DMs) */
export const OUTREACH_KANAL_OPTIONS: Extract<TouchKanal, "call" | "dm">[] = [
  "call",
  "dm",
];

export const OUTREACH_KANAL_LABELS: Record<"call" | "dm", string> = {
  call: "Call",
  dm: "DM",
};

export const ABBRUCH_OPTIONS: Abbruchgrund[] = [
  "zu_klein",
  "kein_schmerz",
  "kein_budget",
  "kein_interesse",
  "timing",
];

export const OPP_VARIANTE_OPTIONS: OppVariante[] = [
  "system_3k",
  "system_crm_6k",
];

export const OPP_STAGE_OPTIONS: OppStage[] = [
  "offen",
  "angebot_raus",
  "gewonnen",
  "verloren",
];

export type StatusTone = "grau" | "orange" | "gelb" | "gruen" | "rot";

/** Status colors for touch Ergebnisse — grau / orange / gelb / grün / rot */
export function ergebnisTone(
  ergebnis: TouchErgebnis | null | undefined,
): StatusTone {
  switch (ergebnis) {
    case "termin_gebucht":
      return "gruen";
    case "gespraech_ohne_termin":
      return "gelb";
    case "erreicht_ohne_gespraech":
      return "orange";
    case "disqualifiziert":
      return "rot";
    case "nicht_erreicht":
    case "kein_ergebnis":
    default:
      return "grau";
  }
}

export function pipelineTone(
  status: PipelineStatus | null | undefined,
): StatusTone {
  switch (status) {
    case "closed":
    case "kunde":
      return "gruen";
    case "set_appointment":
      return "gelb";
    case "callback":
      return "orange";
    case "disqualified":
      return "rot";
    case "neu":
    case "kein_anschluss_1":
    case "kein_anschluss_2":
    case "kein_anschluss_3":
    case "kein_anschluss_4":
    case "kein_anschluss_5":
    default:
      return "grau";
  }
}

export function abbruchAllowed(ergebnis: TouchErgebnis): boolean {
  return (
    ergebnis === "gespraech_ohne_termin" || ergebnis === "disqualifiziert"
  );
}
