export const KEY    = 'rais_crm_v3';

export const S = {
  contacts:      [],
  flt:           'all',
  pg:            1,
  ibuf:          [],
  dueMode:       false,
  eid:           null,
  sortStack:     [],
  colVis:        { stadt: true, region: true, gewerk: false, origin: false, temp: false, lebensbereich: false, ma: true, objekte: true },
  network:       [],
  lebensbereiche: [],
  autoSyncTimer: null,
  syncInProgress: false,
  qnId:          null,
  kbIdx:         -1,
  pinContactId:  null,
  pinListIndex:  null,
  lgPollTimer:   null,
  lgCurrentRun:  null,
  mailComposeId:   null,
  mailComposeMode: 'ai',
  calContactId:    null,
  calType:         null,
  salesrepContactId: null,
  salesrepReport:    null,
  clClients:     [],
  clEid:         null,
  nwEid:         null,
  contactsRev:   0,
};

export const PG     = 30;
export const CC_KEY = 'rais_crm_calls';
export const CL_KEY_SB   = '/rest/v1/crm_clients';
export const NW_KEY_SB   = '/rest/v1/crm_network';
export const LB_KEY_SB   = '/rest/v1/crm_lebensbereiche';

export const LEAD_ORIGIN = {
  scraped:   { label: 'Gescrapt', cls: 'origin-scraped' },
  manual:    { label: 'Manuell', cls: 'origin-manual' },
  in_person: { label: 'Persönlich', cls: 'origin-person' },
  external:  { label: 'Extern', cls: 'origin-external' },
  referral:  { label: 'Empfehlung', cls: 'origin-referral' },
  import:    { label: 'Import', cls: 'origin-import' },
  meta_ads:  { label: 'Meta Ads', cls: 'origin-meta' },
};

export const LEAD_TEMP = { cold: 'Kalt', warm: 'Warm', hot: 'Heiß' };

export const LEBENSBEREICHE = [
  'Handwerk', 'Immobilien', 'Finanzen & Versicherung', 'Tech & Software',
  'Gesundheit', 'Gastronomie', 'Einzelhandel', 'Dienstleistung', 'Sonstiges',
];
export const MEDIUM_ICONS = { whatsapp:'📱', telegram:'✈️', email:'✉️', telefon:'📞', sonstiges:'💬' };

export const TSTAT = ['','Nicht kontaktiert','Nicht erreicht','Mailbox','Rückruf erbeten','Gatekeeper','Interessiert','Termin vereinbart','Angebot gesendet','Kein Interesse'];
export const TSCLS = {'Nicht kontaktiert':'ki','Nicht erreicht':'ni','Mailbox':'ni','Rückruf erbeten':'fu','Gatekeeper':'gk','Interessiert':'in','Termin vereinbart':'te','Angebot gesendet':'ib','Kein Interesse':'ki'};

/** Alte Slugs → aktuelle Taxonomie */
export const STATUS_LEGACY_MAP = {
  kein_anschluss: 'kein_anschluss_1',
  no_show: 'kein_anschluss_1',
  email_nurture: 'kein_anschluss_1',
  demo_termin: 'set_appointment',
  interessiert: 'set_appointment',
  door_open: 'set_appointment',
  gewonnen: 'closed',
  ghost: 'mofo',
  nicht_passend: 'disqualified',
  archiviert: 'disqualified',
};

export const KEIN_ANSCHLUSS_STAGES = [
  'kein_anschluss_1', 'kein_anschluss_2', 'kein_anschluss_3',
  'kein_anschluss_4', 'kein_anschluss_5',
];

export const STATUS = {
  neu:              { cls: 'b-neu',  label: 'Neu',              group: 'default' },
  disqualified:     { cls: 'b-dq',   label: 'Disqualified',     group: 'negative' },
  set_appointment:  { cls: 'b-sa',   label: 'Set Appointment',  group: 'positive' },
  closed:           { cls: 'b-cl',   label: 'Closed',           group: 'positive' },
  kein_anschluss_1: { cls: 'b-ka',   label: 'Kein Anschluss (1)', group: 'neutral' },
  kein_anschluss_2: { cls: 'b-ka',   label: 'Kein Anschluss (2)', group: 'neutral' },
  kein_anschluss_3: { cls: 'b-ka',   label: 'Kein Anschluss (3)', group: 'neutral' },
  kein_anschluss_4: { cls: 'b-ka',   label: 'Kein Anschluss (4)', group: 'neutral' },
  kein_anschluss_5: { cls: 'b-ka',   label: 'Kein Anschluss (5)', group: 'neutral' },
  callback:         { cls: 'b-cb',   label: 'Callback',         group: 'neutral' },
  vernetzt:         { cls: 'b-vn',   label: 'LinkedIn DM',      group: 'neutral' },
  gatekeeper:       { cls: 'b-gk',   label: 'Gatekeeper',       group: 'neutral' },
  mofo:             { cls: 'b-mofo', label: 'MoFo',             group: 'negative' },
  loeschen:         { cls: 'b-lo',   label: 'Löschen',          group: 'negative' },
};

/** Vorab-DQ — nicht in Session-Tracker zählen */
export const SESSION_SKIP_STATUSES = ['loeschen'];

export const PURGE_STATUSES = ['disqualified', 'mofo', 'loeschen'];

/** Positive Pipeline-Status (Dashboard-KPIs, Funnel, Sessions) */
export const POSITIVE_STATUSES = ['set_appointment', 'closed'];

export const STATUS_GROUPS = {
  positive: POSITIVE_STATUSES,
  negative: ['disqualified', 'mofo', 'loeschen'],
  neutral:  ['neu'].concat(KEIN_ANSCHLUSS_STAGES, ['gatekeeper', 'callback', 'vernetzt']),
};

export function isPositiveStatus(status) {
  return POSITIVE_STATUSES.indexOf(status) >= 0;
}
