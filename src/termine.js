import { S } from './state.js';
import { esc } from './ui.js';
import { td } from './utils.js';

let _listenersBound = false;
let _currentFilter = 'all';

const KIND_LABELS = {
  demo: 'Demo / Sales',
  rueckruf: 'Rückruf',
  kundentermin: 'Kundentermin',
};

const KIND_BADGE_CLS = {
  demo: 'termine-badge-demo',
  rueckruf: 'termine-badge-cb',
  kundentermin: 'termine-badge-kunde',
};

function formatTimeFromIso(iso) {
  if (!iso) return '10:00';
  const m = String(iso).match(/T(\d{2}):(\d{2})/);
  if (m) return m[1] + ':' + m[2];
  try {
    const d = new Date(iso);
    if (!isNaN(d.getTime())) {
      return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
    }
  } catch (e) { /* ignore */ }
  return '10:00';
}

function dateFromIso(iso) {
  if (!iso) return null;
  const m = String(iso).match(/^(\d{4}-\d{2}-\d{2})/);
  if (m) return m[1];
  try {
    const d = new Date(iso);
    if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  } catch (e) { /* ignore */ }
  return null;
}

function titleForKind(kind, firma) {
  const name = firma || '—';
  if (kind === 'demo') return 'Demo: ' + name;
  if (kind === 'kundentermin') return 'Kundentermin: ' + name;
  return 'Rückruf: ' + name;
}

export function getTermineItems() {
  const items = [];
  const seenEvents = new Set();

  S.contacts.forEach(function(c) {
    const logs = c.extra && Array.isArray(c.extra.google_cal) ? c.extra.google_cal : [];
    logs.forEach(function(row) {
      if (!row) return;
      const kind = row.type;
      if (!KIND_LABELS[kind]) return;

      const eventKey = row.event_id || (c.id + '|' + kind + '|' + (row.scheduled_start || row.at || ''));
      if (seenEvents.has(eventKey)) return;
      seenEvents.add(eventKey);

      const scheduled = row.scheduled_start || null;
      const date = dateFromIso(scheduled) || c.followup;
      if (!date) return;

      items.push({
        id: c.id,
        kind: kind,
        date: date,
        time: formatTimeFromIso(scheduled),
        title: titleForKind(kind, c.firma),
        firma: c.firma || '',
        telefon: c.telefon || '',
        htmlLink: row.htmlLink || null,
      });
    });
  });

  items.sort(function(a, b) {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    if (a.time !== b.time) return a.time < b.time ? -1 : 1;
    return (a.firma || '').localeCompare(b.firma || '', 'de');
  });
  return items;
}

function formatDayLabel(dateStr) {
  const today = td();
  if (dateStr === today) return 'Heute, ' + dateStr;
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tm = tomorrow.toISOString().slice(0, 10);
  if (dateStr === tm) return 'Morgen, ' + dateStr;
  return dateStr;
}

export function renderTermineAgenda(filter) {
  const root = document.getElementById('termine-agenda');
  if (!root) return;
  if (filter !== undefined) _currentFilter = filter;

  let items = getTermineItems();
  if (_currentFilter === 'demo') items = items.filter(function(x) { return x.kind === 'demo'; });
  if (_currentFilter === 'rueckruf') items = items.filter(function(x) { return x.kind === 'rueckruf'; });
  if (_currentFilter === 'kundentermin') items = items.filter(function(x) { return x.kind === 'kundentermin'; });

  document.querySelectorAll('.termine-filter-chip').forEach(function(btn) {
    btn.classList.toggle('on', btn.dataset.filter === _currentFilter);
  });

  if (!items.length) {
    root.innerHTML =
      '<div class="termine-empty">' +
      '<p>Keine Kalender-Termine im CRM.</p>' +
      '<p class="termine-empty-hint">Per Rechtsklick auf einen Lead: Rückruf, Demo oder Kundentermin planen — Einträge erscheinen hier automatisch.</p>' +
      '</div>';
    return;
  }

  const byDay = {};
  items.forEach(function(it) {
    if (!byDay[it.date]) byDay[it.date] = [];
    byDay[it.date].push(it);
  });
  const days = Object.keys(byDay).sort();

  let html = '';
  days.forEach(function(day) {
    html += '<section class="termine-day-group">';
    html += '<h3 class="termine-day-title">' + esc(formatDayLabel(day)) + '</h3>';
    html += '<ul class="termine-day-list">';
    byDay[day].forEach(function(it) {
      const badgeCls = KIND_BADGE_CLS[it.kind] || 'termine-badge-cb';
      const badge = KIND_LABELS[it.kind] || it.kind;
      html += '<li class="termine-row" data-id="' + esc(it.id) + '" role="button" tabindex="0">';
      html += '<span class="termine-time">' + esc(it.time) + '</span>';
      html += '<span class="termine-badge ' + badgeCls + '">' + badge + '</span>';
      html += '<span class="termine-title">' + esc(it.title) + '</span>';
      if (it.telefon) html += '<span class="termine-tel">' + esc(it.telefon) + '</span>';
      if (it.htmlLink) {
        html += '<a class="termine-gcal-link" href="' + esc(it.htmlLink) + '" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation()">Kalender</a>';
      }
      html += '</li>';
    });
    html += '</ul></section>';
  });
  root.innerHTML = html;

  root.querySelectorAll('.termine-row').forEach(function(row) {
    function openLead() {
      if (typeof window.openP === 'function') window.openP(row.dataset.id);
    }
    row.addEventListener('click', openLead);
    row.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openLead(); }
    });
  });
}

function bindTermineListeners() {
  if (_listenersBound) return;
  _listenersBound = true;
  document.querySelectorAll('.termine-filter-chip').forEach(function(btn) {
    btn.addEventListener('click', function() {
      renderTermineAgenda(btn.dataset.filter || 'all');
    });
  });
}

export function initTerminePage() {
  bindTermineListeners();
  renderTermineAgenda(_currentFilter);
}

window.addEventListener('rais:page-change', function(e) {
  if (e.detail.page === 'termine') initTerminePage();
});

/** Nach Prospecting-Render Agenda aktualisieren, wenn Tab sichtbar */
export function refreshTermineIfActive() {
  const page = document.getElementById('page-termine');
  if (page && page.classList.contains('active')) renderTermineAgenda();
}
