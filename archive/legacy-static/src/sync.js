import { S, KEY, CC_KEY, LB_KEY_SB, DM_OVERLAP_SB } from './state.js';
import { sbGet, sbUpsert, isAuthenticated } from './supabase.js';
import { toast } from './ui.js';
import { getCustomGewerke, addCustomGewerk, getSocials, normalizeContactStatus } from './utils.js';

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

let _persistTimer = null;
let _pushTimer = null;
const _recentlyPushedIds = new Set();

export function markRecentlyPushed(ids) {
  ids.forEach(function(id) { _recentlyPushedIds.add(id); });
  setTimeout(function() {
    ids.forEach(function(id) { _recentlyPushedIds.delete(id); });
  }, 3000);
}

export function wasRecentlyPushed(id) {
  return _recentlyPushedIds.has(id);
}

export function schedulePersist() {
  if (_persistTimer) clearTimeout(_persistTimer);
  _persistTimer = setTimeout(function() {
    _persistTimer = null;
    persist();
  }, 400);
}

export function schedulePushDirty() {
  if (_pushTimer) clearTimeout(_pushTimer);
  _pushTimer = setTimeout(function() {
    _pushTimer = null;
    pushDirty();
  }, 1500);
}

function safeRender() {
  if (typeof window.render === 'function') window.render();
}

async function fetchAllContacts() {
  const limit = 1000;
  let offset = 0;
  const rows = [];
  while (true) {
    const page = await sbGet('/rest/v1/crm_contacts?select=*&order=created.asc&limit=' + limit + '&offset=' + offset);
    if (!Array.isArray(page) || !page.length) break;
    rows.push.apply(rows, page);
    if (page.length < limit) break;
    offset += limit;
  }
  return rows;
}

export async function syncDmOverlapFlags(renderAfter) {
  if (!isAuthenticated()) return;
  try {
    const rows = await sbGet(DM_OVERLAP_SB + '?select=id&is_duplicate=eq.true');
    const dupIds = new Set((rows || []).map(function(r) { return r.id; }));
    S.contacts.forEach(function(c) {
      c._dm_duplicate = dupIds.has(c.id);
    });
    if (renderAfter !== false) safeRender();
  } catch (e) {
    // Non-blocking: duplicate hint should never break core CRM sync.
  }
}

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
    mitarbeiter_anzahl: c.mitarbeiter_anzahl != null ? c.mitarbeiter_anzahl : null,
    objekte_bestand: c.objekte_bestand != null ? c.objekte_bestand : null,
    synced_at: now,
  };
  const extra = buildExtra(c);
  if (extra) row.extra = extra;
  if (c.reviews)           row.reviews = c.reviews;
  if (c.besonderheit)      row.besonderheit = c.besonderheit;
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
    const norm = normalizeContactStatus(c.status);
    if (norm !== c.status) {
      c.status = norm;
      c.synced_at = null;
    }
  });
  try {
    const cv = JSON.parse(localStorage.getItem('rais_crm_colvis'));
    if (cv) {
      Object.assign(S.colVis, cv);
      delete S.colVis.website;
    }
  } catch(e) {}
  ['stadt','region','gewerk','origin','temp','lebensbereich','ma','objekte'].forEach(function(k) {
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
  if (btn) {
    btn.disabled = true;
    btn.style.opacity = '1';
    btn.textContent = '⟳ Sync…';
  }
  let uploadRows = null;
  let uploadContacts = null;
  try {
    const remote = await fetchAllContacts();

    const remoteById = {};
    remote.forEach(function(r) { remoteById[r.id] = r; });

    const LOCAL_WINS = ['status','followup','roi','notiz','kontakt','title','telefon',
      'email','touches','status_changed_at','firma','website','gewerk','stadt','region',
      'source','lead_origin','lead_temp','is_external','lebensbereich','socials','plz','strasse',
      'last_contacted_at','deal_value_eur','consent_basis','mitarbeiter_anzahl','objekte_bestand'];

    const dirtyIds = new Set();
    S.contacts.filter(isDirtyContact).forEach(function(c) { dirtyIds.add(c.id); });
    // Catch edits that happened while remote data was loading.
    S.contacts.forEach(function(c) {
      if (isDirtyContact(c)) dirtyIds.add(c.id);
    });
    const dirtyLocalById = {};
    S.contacts.forEach(function(c) {
      if (dirtyIds.has(c.id)) dirtyLocalById[c.id] = c;
    });

    const unsyncedLocal = Object.values(dirtyLocalById).filter(function(c) {
      return !remoteById[c.id];
    });

    const newContacts = remote.map(function(r) {
      const local = dirtyLocalById[r.id];
      const c = Object.assign({}, r);
      c.status = normalizeContactStatus(c.status);
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
        LOCAL_WINS.forEach(function(f) {
          if (Object.prototype.hasOwnProperty.call(local, f) && local[f] !== undefined) c[f] = local[f];
        });
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
    uploadContacts = S.contacts.filter(function(c) { return uploadIds.has(c.id); });
    uploadRows = uploadContacts.map(function(c) {
      return contactToRow(c, now);
    });
    for (let i = 0; i < uploadRows.length; i += 50) {
      await sbUpsert('/rest/v1/crm_contacts', uploadRows.slice(i, i + 50));
    }
    uploadContacts.forEach(function(c) { c.synced_at = now; });
    markRecentlyPushed(uploadRows.map(function(r) { return r.id; }));

    persist();
    await syncGewerkeCloud();
    await syncLebensbereicheCloud();
    await syncDmOverlapFlags(false);
    safeRender();
    if (!silent) toast('☁ Sync erfolgreich — ' + S.contacts.length + ' Kontakte.');
  } catch(e) {
    if (uploadContacts && uploadContacts.length) {
      uploadContacts.forEach(function(c) { c.synced_at = null; });
      persist();
    }
    safeRender();
    if (!silent) toast('Sync fehlgeschlagen: ' + e.message);
  } finally {
    S.syncInProgress = false;
    if (btn) {
      btn.disabled = false;
      btn.style.opacity = '1';
      btn.textContent = '☁ Sync';
    }
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
    markRecentlyPushed(dirty.map(function(c) { return c.id; }));
    persist();
  } catch(e) {
    dirty.forEach(function(c) { c.synced_at = null; });
    toast('Sync fehlgeschlagen: ' + e.message);
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
