import { STATUS, STATUS_LEGACY_MAP, KEIN_ANSCHLUSS_STAGES } from './state.js';

export function gid() { return Date.now().toString(36) + Math.random().toString(36).slice(2,5); }
export function td() { return new Date().toISOString().slice(0,10); }

export function weekStart(d) {
  const x = new Date(d || new Date());
  x.setHours(0, 0, 0, 0);
  const day = x.getDay() || 7;
  x.setDate(x.getDate() - day + 1);
  return x;
}

export function isKeinAnschlussStatus(status) {
  const s = (status || '').trim();
  if (s === 'kein_anschluss') return true;
  return KEIN_ANSCHLUSS_STAGES.indexOf(s) >= 0;
}

export function keinAnschlussStage(status) {
  const s = normalizeContactStatus(status);
  if (s === 'kein_anschluss') return 1;
  const m = /^kein_anschluss_(\d+)$/.exec(s);
  return m ? parseInt(m[1], 10) : 0;
}

export function nextKeinAnschlussStatus(status) {
  const stage = keinAnschlussStage(status);
  if (stage >= KEIN_ANSCHLUSS_STAGES.length) return KEIN_ANSCHLUSS_STAGES[KEIN_ANSCHLUSS_STAGES.length - 1];
  return KEIN_ANSCHLUSS_STAGES[stage];
}

export function countKeinAnschlussContacts(contacts) {
  return (contacts || []).filter(function(c) { return isKeinAnschlussStatus(c.status); }).length;
}

export function normalizeContactStatus(status) {
  const s = (status || '').trim();
  if (!s) return 'neu';
  if (STATUS[s]) return s;
  if (STATUS_LEGACY_MAP[s]) return STATUS_LEGACY_MAP[s];
  return 'neu';
}

/** Ensures external website links have a scheme (avoids relative URLs on CRM origin). */
export function normalizeWebsite(url) {
  const u = (url || '').trim();
  if (!u) return '';
  if (/^https?:\/\//i.test(u)) return u;
  if (u.startsWith('//')) return 'https:' + u;
  return 'https://' + u;
}

export function relAge(dateStr) {
  if (!dateStr) return '';
  const diff = Math.floor((new Date(td()) - new Date(dateStr)) / 86400000);
  if (diff === 0) return 'heute';
  if (diff === 1) return 'gestern';
  if (diff < 7)  return 'vor ' + diff + 'd';
  if (diff < 30) return 'vor ' + Math.floor(diff/7) + 'w';
  if (diff < 365)return 'vor ' + Math.floor(diff/30) + 'mo';
  return 'vor ' + Math.floor(diff/365) + 'j';
}

export const GKUERZEL = {
  'Fliesenleger':'FL','Elektriker':'EL','Sanitär':'SAN','Heizung':'HZG',
  'Maler':'MAL','Zimmerer':'ZIM','Dachdecker':'DACH','Schreiner':'SCHR',
  'Schlosser':'SLS','Gerüstbauer':'GRST','Gartenbau':'GAR','Reinigung':'REI',
  'Hausverwaltung':'HV','Sonstiges':'SON'
};
export const GSLUG = {
  'Fliesenleger':'fl','Elektriker':'el','Sanitär':'san','Heizung':'hzg',
  'Maler':'mal','Zimmerer':'zim','Dachdecker':'dach','Schreiner':'schr',
  'Schlosser':'sls','Gerüstbauer':'grst','Gartenbau':'gar','Reinigung':'rei',
  'Hausverwaltung':'hv','Sonstiges':'son'
};

/** Einheitliche Gewerk-Schreibweise (z. B. hausverwaltung → Hausverwaltung). */
export function normalizeGewerk(g) {
  const t = (g || '').trim();
  if (!t) return '';
  const key = t.toLowerCase().replace(/\s+/g, '');
  if (key === 'hausverwaltung' || key === 'hausverwaltungen') return 'Hausverwaltung';
  return t;
}
export function gewerkKuerzel(g) { return GKUERZEL[g] || g.slice(0,3).toUpperCase(); }
export function gewerkSlug(g)    { return GSLUG[g]    || 'son'; }

export const CUSTOM_GEWERKE_KEY = 'rais_custom_gewerke';
export function getCustomGewerke() {
  try { return JSON.parse(localStorage.getItem(CUSTOM_GEWERKE_KEY) || '[]'); }
  catch (e) { return []; }
}
export function isColdLead(c) {
  if (!c || c.status !== 'neu') return false;
  const t = c.touches || [];
  return !t.some(function(x) { return x.status || x.notiz || x.datum; });
}

/** Abgeleitete Temperatur — gleiche Logik wie SQL-Backfill + isColdLead. */
export function deriveLeadTemp(c) {
  if (!c) return 'cold';
  if (c.status === 'closed') return 'hot';
  if (isColdLead(c)) return 'cold';
  const closed = ['disqualified', 'mofo', 'loeschen'];
  if (closed.indexOf(normalizeContactStatus(c.status)) >= 0) return c.lead_temp || 'cold';
  return 'warm';
}

export function syncLeadTemp(c) {
  if (!c) return;
  c.lead_temp = deriveLeadTemp(c);
}

export function normalizeLeadOrigin(v) {
  const k = (v || '').trim().toLowerCase();
  const map = {
    scraped: 'scraped', gescrapt: 'scraped',
    manual: 'manual', manuell: 'manual',
    in_person: 'in_person', persoenlich: 'in_person', persönlich: 'in_person',
    external: 'external', extern: 'external',
    referral: 'referral', empfehlung: 'referral',
    import: 'import', meta_ads: 'meta_ads', 'meta ads': 'meta_ads',
  };
  return map[k] || (k || 'manual');
}

export function getSocials(c) {
  const s = (c && c.socials) ? Object.assign({}, c.socials) : {};
  if (c && c.extra) {
    if (!s.facebook && c.extra.facebook) s.facebook = c.extra.facebook;
    if (!s.instagram && c.extra.instagram) s.instagram = c.extra.instagram;
    if (!s.linkedin && c.extra.linkedin) s.linkedin = c.extra.linkedin;
  }
  if (c && c.facebook && !s.facebook) s.facebook = c.facebook;
  if (c && c.instagram && !s.instagram) s.instagram = c.instagram;
  return s;
}

export function addCustomGewerk(name) {
  const trimmed = (name || '').trim();
  if (!trimmed) return '';
  const list = getCustomGewerke();
  if (!list.includes(trimmed)) {
    list.push(trimmed);
    localStorage.setItem(CUSTOM_GEWERKE_KEY, JSON.stringify(list));
  }
  return trimmed;
}
