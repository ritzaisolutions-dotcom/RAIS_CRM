import { S } from './state.js';
import { isAuthenticated, getSupabase } from './supabase.js';
import { isDirtyContact, persist, bumpContactsRev, wasRecentlyPushed } from './sync.js';
import { render } from './prospecting.js';
import { normalizeContactStatus, getSocials } from './utils.js';

let _channel = null;

export function handleRealtimeChange(payload) {
  if (S.syncInProgress) return;
  var eventType = payload.eventType;
  var row = payload.new;
  var old = payload.old;
  if (eventType === 'DELETE') {
    var id = old.id;
    var current = S.contacts.find(function(c) { return c.id === id; });
    if (current && !isDirtyContact(current)) {
      S.contacts = S.contacts.filter(function(c) { return c.id !== id; });
      bumpContactsRev();
      persist(); render();
    }
  } else if (eventType === 'INSERT') {
    if (!S.contacts.some(function(c) { return c.id === row.id; })) {
      var c = Object.assign({}, row);
      c.status = normalizeContactStatus(c.status);
      if (!c.touches) c.touches = [];
      if (!c.socials) c.socials = getSocials(c);
      S.contacts.unshift(c);
      bumpContactsRev();
      persist(); render();
    }
  } else if (eventType === 'UPDATE') {
    var idx = S.contacts.findIndex(function(c) { return c.id === row.id; });
    if (idx !== -1 && !isDirtyContact(S.contacts[idx]) && !wasRecentlyPushed(row.id)) {
      var updated = Object.assign({}, row);
      updated.status = normalizeContactStatus(updated.status);
      if (!updated.touches) updated.touches = [];
      if (!updated.socials) updated.socials = getSocials(updated);
      S.contacts[idx] = updated;
      bumpContactsRev();
      persist(); render();
    }
  }
}

export function teardownRealtime() {
  const sb = getSupabase();
  if (_channel && sb) {
    sb.removeChannel(_channel);
    _channel = null;
  }
}

export async function initRealtime() {
  if (!isAuthenticated()) return;
  const sb = getSupabase();
  if (!sb) return;
  if (_channel) return;

  const { data: { session } } = await sb.auth.getSession();
  if (!session) return;

  try {
    _channel = sb.channel('crm_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'crm_contacts' }, handleRealtimeChange)
      .subscribe();
  } catch (e) {
    console.warn('Realtime init failed:', e.message);
  }
}
