import { S } from './state.js';
import { markDirty, persist, pushDirty } from './sync.js';
import { toast } from './ui.js';
import { td, normalizeWebsite } from './utils.js';
import { whFetch } from './wh.js';

const CAL_LABELS = {
  demo:         { title: 'Demo / Sales Call (15 Min)', duration: 15 },
  rueckruf:     { title: 'Rückruf (15 Min)', duration: 15 },
  kundentermin: { title: 'Kundentermin (15 Min)', duration: 15 },
};

const STATUS_PROTECTED = ['gewonnen', 'disqualified', 'archiviert', 'ghost', 'nicht_passend'];

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

function buildCalPreview(c) {
  const web = normalizeWebsite(c.website) || '—';
  return [
    'Firma: ' + (c.firma || '—'),
    'Ansprechpartner: ' + (c.kontakt || '—'),
    'E-Mail: ' + (c.email || '—'),
    'Telefon: ' + (c.telefon || '—'),
    'Website: ' + web,
  ].join('\n');
}

function calHintForType(type) {
  if (type === 'demo') {
    return 'Interner Kalender (ritzaisolutions@gmail.com). Kunden-Einladung separat von kevin@ritz-ai.solutions senden.';
  }
  if (type === 'kundentermin') {
    return 'Kundentermin im internen Google-Kalender — alle Kontaktdaten in der Beschreibung.';
  }
  return 'Rückruf-Termin im internen Google-Kalender — Kontaktdaten für den Anruf in der Beschreibung.';
}

function applyFollowupAndStatus(c, type, dateStr) {
  if (dateStr) c.followup = dateStr;
  if (STATUS_PROTECTED.indexOf(c.status) >= 0) return;
  if (type === 'rueckruf' && c.status !== 'demo_termin') {
    c.status = 'callback';
    c.status_changed_at = td();
  } else if (type === 'demo') {
    c.status = 'demo_termin';
    c.status_changed_at = td();
  }
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
  document.getElementById('calHint').textContent = calHintForType(type);

  const previewEl = document.getElementById('calPreview');
  if (previewEl) previewEl.textContent = buildCalPreview(c);

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
    const resp = await whFetch('wf8-calendar', {
      type: type,
      start: start,
      duration_minutes: meta.duration,
      contact_id: c.id,
      firma: c.firma || '',
      kontakt: c.kontakt || '',
      email: c.email || '',
      telefon: c.telefon || '',
      website: normalizeWebsite(c.website) || '',
      notiz: (c.notiz || c.besonderheit || '').trim(),
    });
    const data = await resp.json().catch(function() { return {}; });
    if (!resp.ok || !data.ok) {
      throw new Error(data.error || 'HTTP ' + resp.status);
    }
    logCalendarOnContact(c, type, data.event_id, data.htmlLink, start);
    applyFollowupAndStatus(c, type, dateStr);
    markDirty(c);
    persist();
    pushDirty();
    if (typeof window.render === 'function') window.render();
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
  let msg;
  if (type === 'demo') {
    msg = 'Kalendereintrag für Demo / Sales Call (15 Min) anlegen?\n\n' + firma + '\n\nInterner Gmail-Kalender — Einladung an Kunden weiterhin per E-Mail.';
  } else if (type === 'kundentermin') {
    msg = 'Kalendereintrag für Kundentermin (15 Min) anlegen?\n\n' + firma;
  } else {
    msg = 'Kalendereintrag für Rückruf (15 Min) anlegen?\n\n' + firma;
  }
  if (!confirm(msg)) return;
  openCalPop(contact.id, type);
}
