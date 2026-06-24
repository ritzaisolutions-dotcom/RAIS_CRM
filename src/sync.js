import { S, KEY, CC_KEY, LB_KEY_SB } from './state.js';
import { sbGet, sbUpsert, isAuthenticated } from './supabase.js';
import { toast } from './ui.js';
import { getCustomGewerke, addCustomGewerk, getSocials } from './utils.js';

export function clearLocalCrmData() {
  localStorage.removeItem(KEY);
  localStorage.removeItem('rais_crm_colvis');
  localStorage.removeItem(CC_KEY);
}

export function isDirtyContact(c) { return !!(c && !c.synced_at); }

export function isAktionNoetig(c) {
  return !!(c && c.extra && c.extra.aktion_noetig);
}
export function bumpContactsRev() { S.contactsRev++; }

export function markDirty(c) {
  if (c) {
    c.synced_at = null;
    bumpContactsRev();
  }
}
export function persist() { localStorage.setItem(KEY, JSON.stringify(S.contacts)); }

const EXTRA_KEYS = [
  'hauptleistung', 'webseite_alter', 'webseite_vorhanden', 'hat_kalkulator',
  'facebook', 'instagram', 'lead_score', 'score_reasons', 'qualified', 'enriched',
  'rating', 'place_id', 'adresse',
];

function buildExtra(c) {
  const extra = Object.assign({}, c.extra || {});
  EXTRA_KEYS.forEach(function(k) {
    if (c[k] != null && c[k] !== '') extra[k] = c[k];
  });
  return Object.keys(extra).length ? extra : null;
}

function contactToRow(c, now) {
  const socials = getSocials(c);
  const row = {
    id: c.id, created: c.created, firma: c.firma || '',
    kontakt: c.kontakt || null, title: c.title || null,
    telefon: c.telefon || null, email: c.email || null,
    status: c.status || 'neu', followup: c.followup || null,
    roi: c.roi || null, stadt: c.stadt || null,
    region: c.region || null, notiz: c.notiz || null,
    website: c.website || null, gewerk: c.gewerk || null,
    touches: c.touches || [],
    status_changed_at: c.status_changed_at || null,
    source: c.source || null,
    lead_origin: c.lead_origin || null,
    lead_temp: c.lead_temp || null,
    is_external: !!c.is_external,
    lebensbereich: c.lebensbereich || null,
    socials: socials,
    plz: c.plz || null,
    strasse: c.strasse || null,
    last_contacted_at: c.last_contacted_at || null,
    deal_value_eur: c.deal_value_eur != null ? c.deal_value_eur : null,
    consent_basis: c.consent_basis || null,
    synced_at: now,
  };
  const extra = buildExtra(c);
  if (extra) row.extra = extra;
  if (c.reviews)           row.reviews = c.reviews;
  if (c.besonderheit)      row.besonderheit = c.besonderheit;
  if (c.email_1_sent)      row.email_1_sent = c.email_1_sent;
  if (c.email_1_subject)   row.email_1_subject = c.email_1_subject;
  if (c.email_2_sent)      row.email_2_sent = c.email_2_sent;
  if (c.followup_sent)     row.followup_sent = c.followup_sent;
  if (c.email_status)      row.email_status = c.email_status;
  if (c.unsubscribed)      row.unsubscribed = true;
  if (c.reply_received)    row.reply_received = true;
  return row;
}

export function load() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY));
    S.contacts = Array.isArray(s) ? s : [];
  } catch(e) {
    S.contacts = [];
  }
  S.contacts.forEach(function(c) {
    if (!c.touches) c.touches = [{status: c.t1_status||'', datum: c.t1_datum||'', notiz: c.t1_einwand||''}];
    if (!c.socials) c.socials = getSocials(c);
    if (!c.lead_origin) c.lead_origin = 'manual';
    if (!c.lead_temp) c.lead_temp = 'cold';
  });
  try {
    const cv = JSON.parse(localStorage.getItem('rais_crm_colvis'));
    if (cv) {
      Object.assign(S.colVis, cv);
      delete S.colVis.website;
    }
  } catch(e) {}
  ['stadt','region','gewerk','origin','temp','lebensbereich'].forEach(function(k) {
    const cb = document.getElementById('cv-' + k);
    if (cb) cb.checked = !!S.colVis[k];
  });
}

export async function syncCloud(silent) {
  if (!isAuthenticated()) {
    if (!silent) toast('Bitte anmelden.');
    return;
  }
  if (S.syncInProgress) { if (!silent) toast('Sync läuft bereits…'); return; }
  S.syncInProgress = true;
  if (S.autoSyncTimer) { clearTimeout(S.autoSyncTimer); S.autoSyncTimer = null; }
  const btn = document.getElementById('syncBtn');
  btn.disabled = true;
  btn.style.opacity = '1';
  btn.textContent = '⟳ Sync…';
  try {
    const remote = await sbGet('/rest/v1/crm_contacts?select=*&order=created.asc&limit=10000');

    const remoteById = {};
    remote.forEach(function(r) { remoteById[r.id] = r; });

    const LOCAL_WINS = ['status','followup','roi','notiz','kontakt','title','telefon',
      'email','touches','status_changed_at','firma','website','gewerk','stadt','region',
      'source','lead_origin','lead_temp','is_external','lebensbereich','socials','plz','strasse',
      'last_contacted_at','deal_value_eur','consent_basis'];

    const dirtyLocalById = {};
    S.contacts.filter(isDirtyContact).forEach(function(c) { dirtyLocalById[c.id] = c; });

    const unsyncedLocal = Object.values(dirtyLocalById).filter(function(c) {
      return !remoteById[c.id];
    });

    const newContacts = remote.map(function(r) {
      const local = dirtyLocalById[r.id];
      const c = Object.assign({}, r);
      if (!c.touches) c.touches = [];
      if (c.extra) {
        c.hauptleistung      = c.extra.hauptleistung      || null;
        c.webseite_alter     = c.extra.webseite_alter     || null;
        c.webseite_vorhanden = c.extra.webseite_vorhanden || null;
        c.hat_kalkulator     = c.extra.hat_kalkulator     || null;
        c.facebook           = c.extra.facebook           || null;
        c.instagram          = c.extra.instagram          || null;
      }
      if (!c.socials) c.socials = getSocials(c);
      if (local) {
        LOCAL_WINS.forEach(function(f) { if (local[f] != null) c[f] = local[f]; });
        if (local.extra && typeof local.extra === 'object') {
          c.extra = Object.assign({}, r.extra || {}, local.extra);
        } else if (r.extra) {
          c.extra = Object.assign({}, r.extra);
        }
      }
      return c;
    });

    S.contacts = newContacts.concat(unsyncedLocal);
    bumpContactsRev();

    const uploadIds = new Set(
      Object.keys(dirtyLocalById).concat(unsyncedLocal.map(function(c) { return c.id; }))
    );

    const now = new Date().toISOString();
    const rows = S.contacts.filter(function(c) { return uploadIds.has(c.id); }).map(function(c) {
      c.synced_at = now;
      return contactToRow(c, now);
    });
    for (let i = 0; i < rows.length; i += 50) {
      await sbUpsert('/rest/v1/crm_contacts', rows.slice(i, i + 50));
    }

    persist();
    await syncGewerkeCloud();
    await syncLebensbereicheCloud();
    render();
    toast('☁ Sync erfolgreich — ' + S.contacts.length + ' Kontakte.');
  } catch(e) {
    render();
    if (!silent) toast('Sync fehlgeschlagen: ' + e.message);
  } finally {
    S.syncInProgress = false;
    btn.disabled = false;
    btn.style.opacity = '1';
    btn.textContent = '☁ Sync';
  }
}

export async function pushDirty() {
  if (!isAuthenticated()) return;
  if (S.syncInProgress) return;
  const dirty = S.contacts.filter(isDirtyContact);
  if (!dirty.length) return;
  S.syncInProgress = true;
  const btn = document.getElementById('syncBtn');
  if (btn) { btn.textContent = '⟳ Sync…'; btn.style.opacity = '.6'; btn.disabled = true; }
  try {
    const now = new Date().toISOString();
    const rows = dirty.map(function(c) {
      c.synced_at = now;
      return contactToRow(c, now);
    });
    for (let i = 0; i < rows.length; i += 50) {
      await sbUpsert('/rest/v1/crm_contacts', rows.slice(i, i + 50));
    }
    persist();
  } catch(e) {
    dirty.forEach(function(c) { c.synced_at = null; });
  } finally {
    S.syncInProgress = false;
    if (btn) { btn.textContent = '☁ Sync'; btn.style.opacity = '1'; btn.disabled = false; }
  }
}

/** Fetch all crm_gewerke rows and merge names into localStorage. */
export async function syncGewerkeCloud() {
  if (!isAuthenticated()) return;
  try {
    const rows = await sbGet('/rest/v1/crm_gewerke?select=name&order=name.asc');
    rows.forEach(function(r) { if (r.name) addCustomGewerk(r.name); });
  } catch (e) {}
}

/** Upsert a single Gewerk name to crm_gewerke. Fire-and-forget. */
export async function pushGewerkCloud(name, lebensbereich) {
  if (!isAuthenticated() || !name) return;
  try {
    const row = { name: name };
    if (lebensbereich) row.lebensbereich = lebensbereich;
    await sbUpsert('/rest/v1/crm_gewerke', row);
  } catch (e) {}
}

/** Fetch crm_lebensbereiche into S.lebensbereiche. */
export async function syncLebensbereicheCloud() {
  if (!isAuthenticated()) return;
  try {
    const rows = await sbGet(LB_KEY_SB + '?select=name&order=sort_order.asc');
    if (rows && rows.length) {
      S.lebensbereiche = rows.map(function(r) { return r.name; });
    }
  } catch (e) {}
}
