export const KEY    = 'rais_crm_v3';

export const S = {
  contacts:      [],
  flt:           'all',
  pg:            1,
  ibuf:          [],
  dueMode:       false,
  eid:           null,
  sortStack:     [],
  colVis:        { website: true, stadt: false, region: false, gewerk: false },
  autoSyncTimer: null,
  syncInProgress: false,
  qnId:          null,
  kbIdx:         -1,
  lgPollTimer:   null,
  lgCurrentRun:  null,
  esContactId:   null,
  clClients:     [],
  clEid:         null,
};
export const PG     = 30;
export const CC_KEY = 'rais_crm_calls';
export const CL_KEY_SB   = '/rest/v1/crm_clients';
export const MEDIUM_ICONS = { whatsapp:'📱', telegram:'✈️', email:'✉️', telefon:'📞', sonstiges:'💬' };

export const TSTAT = ['','Nicht kontaktiert','Nicht erreicht','Mailbox','Rückruf erbeten','Gatekeeper','Interessiert','Termin vereinbart','Angebot gesendet','Kein Interesse'];
export const TSCLS = {'Nicht kontaktiert':'ki','Nicht erreicht':'ni','Mailbox':'ni','Rückruf erbeten':'fu','Gatekeeper':'gk','Interessiert':'in','Termin vereinbart':'te','Angebot gesendet':'ib','Kein Interesse':'ki'};

export const STATUS = {
  neu:            { cls: 'b-neu', label: 'Neu' },
  kein_anschluss: { cls: 'b-ni',  label: 'Kein Anschluss' },
  gatekeeper:     { cls: 'b-gk',  label: 'Gatekeeper' },
  callback:       { cls: 'b-fu',  label: 'Callback' },
  email_nurture:  { cls: 'b-ib',  label: 'Email Nurture' },
  interessiert:   { cls: 'b-in',  label: 'Interessiert' },
  demo_termin:    { cls: 'b-te',  label: 'Demo Termin' },
  no_show:        { cls: 'b-ns',  label: 'No Show' },
  disqualified:   { cls: 'b-ki',  label: 'Disqualified' },
  gewonnen:       { cls: 'b-gw',  label: 'Gewonnen' },
  archiviert:     { cls: 'b-ki',  label: 'Archiviert' },
};
