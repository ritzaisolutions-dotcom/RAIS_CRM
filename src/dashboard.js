import { S, LEAD_ORIGIN, LEAD_TEMP } from './state.js';
import { isColdLead, deriveLeadTemp } from './utils.js';
import { loadClients } from './clients.js';
import { esc } from './ui.js';
import { navigateTo } from './sidebar.js';
import { setF, filterDue } from './prospecting.js';

let _inited = false;

window.addEventListener('rais:page-change', function(e) {
  if (e.detail.page === 'dashboard') initDashboard();
});

function weekStart(d) {
  const x = new Date(d);
  const day = x.getDay() || 7;
  x.setDate(x.getDate() - day + 1);
  x.setHours(0, 0, 0, 0);
  return x;
}

function monthStart(d) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function contactCreatedDate(c) {
  if (!c.created) return null;
  if (typeof c.created === 'number') return new Date(c.created);
  const s = String(c.created);
  if (/^\d+$/.test(s)) return new Date(parseInt(s, 10));
  return new Date(s);
}

function countNewSince(contacts, since) {
  return contacts.filter(function(c) {
    const d = contactCreatedDate(c);
    return d && d >= since;
  }).length;
}

function distBar(items) {
  if (!items.length) return '<p class="dash-empty">Keine Daten</p>';
  const max = Math.max.apply(null, items.map(function(x) { return x.n; })) || 1;
  return items.map(function(x) {
    const pct = Math.round((x.n / max) * 100);
    return '<div class="dash-bar-row">' +
      '<span class="dash-bar-label">' + esc(x.label) + '</span>' +
      '<div class="dash-bar-track"><div class="dash-bar-fill" style="width:' + pct + '%"></div></div>' +
      '<span class="dash-bar-n">' + x.n + '</span>' +
    '</div>';
  }).join('');
}

function kpiCard(n, label, action) {
  const click = action ? ' dash-kpi-click" role="button" tabindex="0" onclick="' + action + '"' : '"';
  return '<div class="dash-kpi' + click + '>' +
    '<span class="dash-kpi-n">' + n + '</span>' +
    '<span class="dash-kpi-l">' + label + '</span></div>';
}

export function dashGoProspecting(filter) {
  navigateTo('prospecting');
  if (filter === 'due') filterDue();
  else setF(filter || 'all');
}

export function dashGoClients() {
  navigateTo('clients');
}

export function initDashboard() {
  if (!_inited) {
    _inited = true;
    loadClients().then(renderDashboard);
  } else {
    renderDashboard();
  }
}

export function renderDashboard() {
  const root = document.getElementById('dashboard-root');
  if (!root) return;

  const now = new Date();
  const ws = weekStart(now);
  const ms = monthStart(now);
  const contacts = S.contacts || [];

  const newWeek = countNewSince(contacts, ws);
  const newMonth = countNewSince(contacts, ms);
  const cold = contacts.filter(isColdLead).length;
  let warm = 0, hot = 0, tempCold = 0;
  contacts.forEach(function(c) {
    const t = deriveLeadTemp(c);
    if (t === 'warm') warm++;
    else if (t === 'hot') hot++;
    else tempCold++;
  });
  const won = contacts.filter(function(c) { return c.status === 'gewonnen'; }).length;
  const clients = (S.clClients || []).length;

  const originCounts = {};
  contacts.forEach(function(c) {
    const k = c.lead_origin || 'manual';
    originCounts[k] = (originCounts[k] || 0) + 1;
  });
  const originBars = Object.keys(LEAD_ORIGIN).map(function(k) {
    return { label: LEAD_ORIGIN[k].label, n: originCounts[k] || 0 };
  }).filter(function(x) { return x.n > 0; });

  const lbCounts = {};
  contacts.forEach(function(c) {
    const k = c.lebensbereich || '—';
    lbCounts[k] = (lbCounts[k] || 0) + 1;
  });
  const lbBars = Object.keys(lbCounts).sort(function(a, b) { return lbCounts[b] - lbCounts[a]; })
    .slice(0, 12).map(function(k) { return { label: k, n: lbCounts[k] }; });

  const gwCounts = {};
  contacts.forEach(function(c) {
    if (!c.gewerk) return;
    gwCounts[c.gewerk] = (gwCounts[c.gewerk] || 0) + 1;
  });
  const gwBars = Object.keys(gwCounts).sort(function(a, b) { return gwCounts[b] - gwCounts[a]; })
    .slice(0, 10).map(function(k) { return { label: k, n: gwCounts[k] }; });

  root.innerHTML =
    '<div class="dash-kpis">' +
      kpiCard(newWeek, 'Neue Leads (Woche)', 'dashGoProspecting(\'all\')') +
      kpiCard(newMonth, 'Neue Leads (Monat)', 'dashGoProspecting(\'all\')') +
      kpiCard(cold, 'Kalte Leads', 'dashGoProspecting(\'kalt\')') +
      kpiCard(warm + ' / ' + hot, 'Warm / Heiß', 'dashGoProspecting(\'interessiert\')') +
      kpiCard(won, 'Gewonnen', 'dashGoProspecting(\'gewonnen\')') +
      kpiCard(clients, 'Aktive Clients', 'dashGoClients()') +
    '</div>' +
    '<div class="dash-grid">' +
      '<section class="dash-card"><h3>Herkunft</h3>' + distBar(originBars) + '</section>' +
      '<section class="dash-card"><h3>Lebensbereich</h3>' + distBar(lbBars) + '</section>' +
      '<section class="dash-card"><h3>Gewerk (Top 10)</h3>' + distBar(gwBars) + '</section>' +
      '<section class="dash-card"><h3>Temperatur</h3>' + distBar([
        { label: LEAD_TEMP.cold, n: tempCold },
        { label: LEAD_TEMP.warm, n: warm },
        { label: LEAD_TEMP.hot, n: hot },
      ].filter(function(x) { return x.n > 0; })) + '</section>' +
    '</div>';
}
