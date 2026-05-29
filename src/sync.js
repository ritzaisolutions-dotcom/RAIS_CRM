import { S, KEY } from './state.js';
import { sbGet, sbUpsert } from './supabase.js';
import { toast } from './ui.js';

export function isDirtyContact(c) { return !!(c && !c.synced_at); }
export function markDirty(c) { if (c) c.synced_at = null; }
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
  });
  try {
    const cv = JSON.parse(localStorage.getItem('rais_crm_colvis'));
    if (cv) Object.assign(S.colVis, cv);
  } catch(e) {}
  ['website','stadt','region','gewerk'].forEach(function(k) {
    const cb = document.getElementById('cv-' + k);
    if (cb) cb.checked = !!S.colVis[k];
  });
}

export async function syncCloud(silent) {
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
      'email','touches','status_changed_at','firma','website','gewerk','stadt','region'];

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
      }
      if (local) {
        LOCAL_WINS.forEach(function(f) { if (local[f] != null) c[f] = local[f]; });
      }
      return c;
    });

    S.contacts = newContacts.concat(unsyncedLocal);

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
