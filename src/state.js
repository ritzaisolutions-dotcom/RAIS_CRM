export const KEY    = 'rais_crm_v3';

export const S = {
  contacts:      [],
  flt:           'all',
  pg:            1,
  ibuf:          [],
  dueMode:       false,
  eid:           null,
  sortStack:     [],
  colVis:        { stadt: false, region: false, gewerk: false, origin: true, temp: false, lebensbereich: false },
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
};

export const LEAD_TEMP = { cold: 'Kalt', warm: 'Warm', hot: 'Heiß' };

export const LEBENSBEREICHE = [
  'Handwerk', 'Immobilien', 'Finanzen & Versicherung', 'Tech & Software',
  'Gesundheit', 'Gastronomie', 'Einzelhandel', 'Dienstleistung', 'Sonstiges',
];
export const MEDIUM_ICONS = { whatsapp:'📱', telegram:'✈️', email:'✉️', telefon:'📞', sonstiges:'💬' };

export const TSTAT = ['','Nicht kontaktiert','Nicht erreicht','Mailbox','Rückruf erbeten','Gatekeeper','Interessiert','Termin vereinbart','Angebot gesendet','Kein Interesse'];
export const TSCLS = {'Nicht kontaktiert':'ki','Nicht erreicht':'ni','Mailbox':'ni','Rückruf erbeten':'fu','Gatekeeper':'gk','Interessiert':'in','Termin vereinbart':'te','Angebot gesendet':'ib','Kein Interesse':'ki'};

export const STATUS = {
  // ── Aktiv / Neutral ──
  neu:            { cls: 'b-neu', label: 'Neu',            group: 'neutral' },
  kein_anschluss:   { cls: 'b-ni',  label: 'Kein Anschluss',   group: 'neutral' },
  kein_anschluss_2: { cls: 'b-ka2', label: 'Kein Anschluss 2', group: 'neutral' },
  gatekeeper:     { cls: 'b-gk',  label: 'Gatekeeper',     group: 'neutral' },
  callback:       { cls: 'b-fu',  label: 'Callback',        group: 'neutral' },
  no_show:        { cls: 'b-ns',  label: 'No Show',         group: 'neutral' },
  email_nurture:  { cls: 'b-ib',  label: 'Email Nurture',   group: 'neutral' },
  // ── Positiv ──
  interessiert:   { cls: 'b-in',  label: 'Interessiert',    group: 'positive' },
  door_open:      { cls: 'b-do',  label: 'Tür Offen',       group: 'positive' },
  demo_termin:    { cls: 'b-te',  label: 'Demo Termin',      group: 'positive' },
  gewonnen:       { cls: 'b-gw',  label: 'Gewonnen',         group: 'positive' },
  // ── Geschlossen ──
  nicht_passend:  { cls: 'b-np',  label: 'Nicht passend',   group: 'closed' },
  disqualified:   { cls: 'b-ki',  label: 'Disqualified',    group: 'closed' },
  archiviert:     { cls: 'b-ki',  label: 'Archiviert',      group: 'closed' },
  ghost:          { cls: 'b-gh',  label: 'Ghost',           group: 'closed' },
};
