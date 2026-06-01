import { S } from './state.js';
import { markDirty, persist, pushDirty } from './sync.js';
import { toast } from './ui.js';
import { td } from './utils.js';

const WH_BASE  = 'https://n8n.ritz-ai.solutions/webhook/';
const WH_TOKEN = 'ESyfcQbQHy5sFFJBRsmPJSPIs1-87jQw7zCGHetsGpc';
const WH = {
  calendar: WH_BASE + 'wf8-calendar',
};

const CAL_LABELS = {
  demo: { title: 'Demo-Termin (15 Min)', duration: 15 },
  rueckruf: { title: 'Rückruf (5 Min)', duration: 5 },
};

function whFetch(url, opts) {
  opts = opts || {};
  opts.headers = Object.assign({ 'Content-Type': 'application/json', 'X-RAIS-Token': WH_TOKEN }, opts.headers || {});
  return fetch(url, opts);
}

function getContact(id) {
  return S.contacts.find(function(x) { return x.id === id; });
}

function _calContact() {
  return S.calContactId ? getContact(S.calContactId) : null;
}

/** Lokale Datum+Uhrzeit → ISO mit Browser-Zeitzone */
export function localIsoFromDateAndTime(dateStr, timeStr) {
  const parts = (dateStr || '').split('-').map(Number);
  if (parts.length < 3 || parts.some(function(n) { return isNaN(n); })) return null;
  const tp = (timeStr || '10:00').split(':').map(Number);
  const y = parts[0];
  const m = parts[1];
  const d = parts[2];
  const hh = tp[0] || 10;
  const mm = tp[1] || 0;
  const dt = new Date(y, m - 1, d, hh, mm, 0);
  if (isNaN(dt.getTime())) return null;
  const pad = function(n) { return String(n).padStart(2, '0'); };
  const offMin = -dt.getTimezoneOffset();
  const sign = offMin >= 0 ? '+' : '-';
  const abs = Math.abs(offMin);
  const oh = pad(Math.floor(abs / 60));
  const om = pad(abs % 60);
  return y + '-' + pad(m) + '-' + pad(d) + 'T' + pad(hh) + ':' + pad(mm) + ':00' + sign + oh + ':' + om;
}

function logCalendarOnContact(c, type, eventId, htmlLink, scheduledStart) {
  if (!c.extra || typeof c.extra !== 'object') c.extra = {};
  if (!Array.isArray(c.extra.google_cal)) c.extra.google_cal = [];
  c.extra.google_cal.push({
    type: type,
    event_id: eventId || null,
    htmlLink: htmlLink || null,
    scheduled_start: scheduledStart || null,
    at: new Date().toISOString(),
  });
  if (c.extra.google_cal.length > 20) {
    c.extra.google_cal = c.extra.google_cal.slice(-20);
  }
}

export function openCalPop(contactId, type) {
  const c = getContact(contactId);
  if (!c) return;
  const meta = CAL_LABELS[type];
  if (!meta) return;

  S.calContactId = contactId;
  S.calType = type;

  const pop = document.getElementById('calPop');
  if (!pop) return;

  document.getElementById('calTitle').textContent = meta.title;
  document.getElementById('calFirma').textContent = c.firma || '—';
  document.getElementById('calHint').textContent =
    type === 'demo'
      ? 'Interner Kalender (Gmail). Kunden-Einladung separat von kevin@ritz-ai.solutions senden.'
      : 'Interner Erinnerungstermin mit Kontaktdaten für den Anruf.';

  const dateEl = document.getElementById('calDate');
  const timeEl = document.getElementById('calTime');
  if (dateEl) dateEl.value = c.followup || td();
  if (timeEl) timeEl.value = '10:00';

  const btn = document.getElementById('calCreateBtn');
  if (btn) { btn.disabled = false; btn.textContent = 'In Kalender anlegen'; }

  pop.classList.add('on');
}

export function closeCalPop() {
  const pop = document.getElementById('calPop');
  if (pop) pop.classList.remove('on');
  S.calContactId = null;
  S.calType = null;
}

export async function calCreate() {
  const c = _calContact();
  const type = S.calType;
  const meta = CAL_LABELS[type];
  if (!c || !meta) return;

  const dateStr = (document.getElementById('calDate').value || '').trim();
  const timeStr = (document.getElementById('calTime').value || '10:00').trim();
  if (!dateStr) {
    toast('Bitte Datum wählen.');
    return;
  }

  const start = localIsoFromDateAndTime(dateStr, timeStr);
  if (!start) {
    toast('Ungültiges Datum oder Uhrzeit.');
    return;
  }

  const btn = document.getElementById('calCreateBtn');
  if (btn) { btn.disabled = true; btn.textContent = 'Wird angelegt…'; }

  try {
    const resp = await whFetch(WH.calendar, {
      method: 'POST',
      body: JSON.stringify({
        type: type,
        start: start,
        duration_minutes: meta.duration,
        contact_id: c.id,
        firma: c.firma || '',
        kontakt: c.kontakt || '',
        email: c.email || '',
        telefon: c.telefon || '',
        website: c.website || '',
        notiz: (c.notiz || c.besonderheit || '').trim(),
      }),
    });
    const data = await resp.json().catch(function() { return {}; });
    if (!resp.ok || !data.ok) {
      throw new Error(data.error || 'HTTP ' + resp.status);
    }
    logCalendarOnContact(c, type, data.event_id, data.htmlLink, start);
    markDirty(c);
    persist();
    pushDirty();
    if (typeof window.refreshTermineAgenda === 'function') window.refreshTermineAgenda();
    toast('Kalendereintrag angelegt: ' + (c.firma || meta.title) + '.');
    if (data.htmlLink) {
      setTimeout(function() {
        if (confirm('Termin in Google Kalender öffnen?')) {
          window.open(data.htmlLink, '_blank', 'noopener,noreferrer');
        }
      }, 300);
    }
    closeCalPop();
  } catch (e) {
    toast('Kalender: ' + e.message);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'In Kalender anlegen'; }
  }
}

export function maybeOfferCalendar(contact, type) {
  if (!contact || !contact.id) return;
  const meta = CAL_LABELS[type];
  if (!meta) return;
  const firma = contact.firma || 'Lead';
  const msg = type === 'demo'
    ? 'Kalendereintrag für Demo (15 Min) anlegen?\n\n' + firma + '\n\nInterner Gmail-Kalender — Einladung an Kunden weiterhin per E-Mail.'
    : 'Kalendereintrag für Rückruf (5 Min) anlegen?\n\n' + firma;
  if (!confirm(msg)) return;
  openCalPop(contact.id, type);
}
