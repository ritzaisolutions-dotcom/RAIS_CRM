import { S } from './state.js';
import { isAuthenticated, getSupabase } from './supabase.js';
import { isDirtyContact, persist } from './sync.js';
import { render } from './prospecting.js';

let _channel = null;

export function handleRealtimeChange(payload) {
  if (S.syncInProgress) return;
  var eventType = payload.eventType;
  var row = payload.new;
  var old = payload.old;
  if (eventType === 'DELETE') {
    var id = old.id;
    if (S.contacts.some(function(c) { return c.id === id; })) {
      S.contacts = S.contacts.filter(function(c) { return c.id !== id; });
      persist(); render();
    }
  } else if (eventType === 'INSERT') {
    if (!S.contacts.some(function(c) { return c.id === row.id; })) {
      var c = Object.assign({}, row);
      if (!c.touches) c.touches = [];
      S.contacts.unshift(c);
      persist(); render();
    }
  } else if (eventType === 'UPDATE') {
    var idx = S.contacts.findIndex(function(c) { return c.id === row.id; });
    if (idx !== -1 && !isDirtyContact(S.contacts[idx])) {
      var updated = Object.assign({}, row);
      if (!updated.touches) updated.touches = [];
      S.contacts[idx] = updated;
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
