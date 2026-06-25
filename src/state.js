export const KEY    = 'rais_crm_v3';

export const S = {
  contacts:      [],
  flt:           'all',
  pg:            1,
  ibuf:          [],
  dueMode:       false,
  eid:           null,
  sortStack:     [],
  colVis:        { stadt: true, region: true, gewerk: false, origin: false, temp: false, lebensbereich: false },
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
  projects:      [],
  todos:         [],
  prjEid:        null,
  todoEid:       null,
  contactsRev:   0,
};

export const PG     = 30;
export const CC_KEY = 'rais_crm_calls';
export const CL_KEY_SB   = '/rest/v1/crm_clients';
export const NW_KEY_SB   = '/rest/v1/crm_network';
export const PRJ_KEY_SB  = '/rest/v1/crm_projects';
export const TODO_KEY_SB = '/rest/v1/crm_todos';
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

/** To-do / Projekt-Kategorien (slug → Anzeige) */
export const TODO_CATEGORIES = [
  { id: 'rais_sales',       label: 'RAIS - Sales' },
  { id: 'rais_building',    label: 'RAIS - Building' },
  { id: 'eckstein_podcast', label: 'ECKSTEIN Podcast' },
  { id: 'personal_brand',   label: 'personal brand' },
  { id: 'private',          label: 'private' },
  { id: 'education',        label: 'education' },
  { id: 'faith',            label: 'faith' },
  { id: 'health',           label: 'health' },
];

export const TSTAT = ['','Nicht kontaktiert','Nicht erreicht','Mailbox','Rückruf erbeten','Gatekeeper','Interessiert','Termin vereinbart','Angebot gesendet','Kein Interesse'];
export const TSCLS = {'Nicht kontaktiert':'ki','Nicht erreicht':'ni','Mailbox':'ni','Rückruf erbeten':'fu','Gatekeeper':'gk','Interessiert':'in','Termin vereinbart':'te','Angebot gesendet':'ib','Kein Interesse':'ki'};

/** Alte Slugs → neue 8-Status-Taxonomie */
export const STATUS_LEGACY_MAP = {
  kein_anschluss_2: 'kein_anschluss',
  no_show: 'kein_anschluss',
  email_nurture: 'kein_anschluss',
  demo_termin: 'set_appointment',
  interessiert: 'set_appointment',
  door_open: 'set_appointment',
  gewonnen: 'closed',
  ghost: 'mofo',
  nicht_passend: 'disqualified',
  archiviert: 'disqualified',
};

export const STATUS = {
  neu:              { cls: 'b-neu',  label: 'Neu',              group: 'default' },
  disqualified:     { cls: 'b-dq',   label: 'Disqualified',     group: 'negative' },
  set_appointment:  { cls: 'b-sa',   label: 'Set Appointment',  group: 'positive' },
  closed:           { cls: 'b-cl',   label: 'Closed',           group: 'positive' },
  kein_anschluss:   { cls: 'b-ka',   label: 'Kein Anschluss',   group: 'neutral' },
  callback:         { cls: 'b-cb',   label: 'Callback',         group: 'neutral' },
  gatekeeper:       { cls: 'b-gk',   label: 'Gatekeeper',       group: 'neutral' },
  mofo:             { cls: 'b-mofo', label: 'MoFo',             group: 'negative' },
};

export const PURGE_STATUSES = ['disqualified', 'mofo'];
