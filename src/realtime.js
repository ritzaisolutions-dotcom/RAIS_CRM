import { S } from './state.js';
import { SB_URL, SB_KEY } from './supabase.js';
import { isDirtyContact, persist } from './sync.js';

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

export async function initRealtime() {
  try {
    const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
    const sbRt = createClient(SB_URL, SB_KEY);
    sbRt.channel('crm_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'crm_contacts' }, handleRealtimeChange)
      .subscribe();
  } catch(e) {
    console.warn('Realtime init failed:', e.message);
  }
}
