import { loadClients } from './clients.js';
import { navigateTo } from './sidebar.js';
import { setF, filterDue } from './prospecting.js';
import { getSessionStats } from './sessions.js';
import { sbGet } from './supabase.js';
import { td } from './utils.js';
import {
  channelPerformanceSeries,
  summarizeChannelSeries,
  renderMultiLineChart,
} from './analytics.js';

const PERFORMANCE_MONTHS = 6;
const PERFORMANCE_METRICS = {
  touches: {
    key: 'touches',
    label: 'Touches / Anwahlen',
    subtitle: 'Volumen der Kontaktversuche pro Monat',
    callKey: 'callTouches',
    dmKey: 'dmTouches',
  },
  conversations: {
    key: 'conversations',
    label: 'Gespräche / Antworten',
    subtitle: 'Reaktionen auf Touches pro Monat',
    callKey: 'callConversations',
    dmKey: 'dmConversations',
  },
  appointments: {
    key: 'appointments',
    label: 'Gelegte Termine',
    subtitle: 'Termin-Conversion in beiden Kanälen',
    callKey: 'callAppointments',
    dmKey: 'dmAppointments',
  },
  closes: {
    key: 'closes',
    label: 'Closes',
    subtitle: 'Gewonnene Deals nach Kanal',
    callKey: 'callCloses',
    dmKey: 'dmCloses',
  },
};

let _inited = false;
let _lastSess = { count: 0, totalLeads: 0, totalMinutes: 0 };
let _channelSeries = [];
let _activeMetric = 'touches';

window.addEventListener('rais:page-change', function(e) {
  if (e.detail.page === 'dashboard') initDashboard();
});

export function dashGoProspecting(filter) {
  navigateTo('prospecting');
  if (filter === 'due') filterDue();
  else setF(filter || 'all');
}

export function dashGoClients() { navigateTo('clients'); }

export function toggleDashSecondary() {
  const body = document.getElementById('dash-secondary-body');
  const btn = document.getElementById('dash-secondary-toggle');
  if (!body || !btn) return;
  const open = body.hidden;
  body.hidden = !open;
  btn.textContent = open ? 'Sessions ▾' : 'Sessions ▸';
}

function formatInt(n) {
  return new Intl.NumberFormat('de-DE', { maximumFractionDigits: 0 }).format(Number(n || 0));
}

function pct(part, total) {
  if (!total) return '0%';
  return Math.round((part / total) * 100) + '%';
}

function metricButtonsHtml() {
  return Object.keys(PERFORMANCE_METRICS).map(function(metricKey) {
    const cfg = PERFORMANCE_METRICS[metricKey];
    const on = metricKey === _activeMetric ? ' on' : '';
    return '<button type="button" class="dash-metric-btn' + on + '" data-dash-metric="' + metricKey + '">' + cfg.label + '</button>';
  }).join('');
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function updateChannelKpis() {
  const totals = summarizeChannelSeries(_channelSeries);
  setText('dash-call-touches', formatInt(totals.callTouches));
  setText('dash-call-conversations', formatInt(totals.callConversations));
  setText('dash-call-appointments', formatInt(totals.callAppointments));
  setText('dash-call-closes', formatInt(totals.callCloses));
  setText('dash-dm-touches', formatInt(totals.dmTouches));
  setText('dash-dm-conversations', formatInt(totals.dmConversations));
  setText('dash-dm-appointments', formatInt(totals.dmAppointments));
  setText('dash-dm-closes', formatInt(totals.dmCloses));
  setText('dash-call-conv-rate', pct(totals.callConversations, totals.callTouches));
  setText('dash-call-close-rate', pct(totals.callCloses, totals.callTouches));
  setText('dash-dm-conv-rate', pct(totals.dmConversations, totals.dmTouches));
  setText('dash-dm-close-rate', pct(totals.dmCloses, totals.dmTouches));
}

function renderPerformanceChart() {
  const container = document.getElementById('dash-performance-chart');
  if (!container || !_channelSeries.length) return;
  const cfg = PERFORMANCE_METRICS[_activeMetric] || PERFORMANCE_METRICS.touches;
  const series = _channelSeries.map(function(row) {
    return {
      label: row.label,
      call: row[cfg.callKey] || 0,
      dm: row[cfg.dmKey] || 0,
    };
  });
  setText('dash-performance-subtitle', cfg.subtitle);
  renderMultiLineChart(container, series, [
    { key: 'call', label: 'Cold Calls', color: '#EC6A37', area: true, areaOpacity: 0.15, points: true },
    { key: 'dm', label: 'DM-Outbound', color: '#789464', area: true, areaOpacity: 0.12, points: true },
  ]);
}

function bindMetricButtons(root) {
  root.querySelectorAll('[data-dash-metric]').forEach(function(btn) {
    btn.addEventListener('click', function() {
      _activeMetric = btn.getAttribute('data-dash-metric') || 'touches';
      root.querySelectorAll('[data-dash-metric]').forEach(function(el) {
        el.classList.toggle('on', el === btn);
      });
      renderPerformanceChart();
    });
  });
  const callBtn = root.querySelector('[data-dash-open="prospecting"]');
  if (callBtn) callBtn.addEventListener('click', function() { dashGoProspecting('all'); });
  const dmBtn = root.querySelector('[data-dash-open="dm"]');
  if (dmBtn) dmBtn.addEventListener('click', function() { navigateTo('dm-akquise'); });
}

async function loadChannelSeries() {
  const start = new Date();
  start.setDate(1);
  start.setMonth(start.getMonth() - (PERFORMANCE_MONTHS - 1));
  start.setHours(0, 0, 0, 0);
  const startIso = start.toISOString();
  const startDate = startIso.slice(0, 10);

  const results = await Promise.allSettled([
    sbGet('/rest/v1/crm_call_events?select=event_type,result_bucket,occurred_at&occurred_at=gte.' + startIso + '&order=occurred_at.asc'),
    sbGet('/rest/v1/linkedin_outreach_events?select=status_to,changed_at&changed_at=gte.' + startIso + '&order=changed_at.asc'),
    sbGet('/rest/v1/linkedin_outreach?select=crm_contact_id'),
    sbGet('/rest/v1/crm_contacts?select=id,status,status_changed_at&status=eq.closed&status_changed_at=gte.' + startDate),
  ]);

  const callEvents = results[0].status === 'fulfilled' && Array.isArray(results[0].value) ? results[0].value : [];
  const dmEvents = results[1].status === 'fulfilled' && Array.isArray(results[1].value) ? results[1].value : [];
  const dmLeads = results[2].status === 'fulfilled' && Array.isArray(results[2].value) ? results[2].value : [];
  const dmClosedContacts = results[3].status === 'fulfilled' && Array.isArray(results[3].value) ? results[3].value : [];
  return channelPerformanceSeries('month', PERFORMANCE_MONTHS, { callEvents, dmEvents, dmLeads, dmClosedContacts });
}

async function renderSchlagzahlHeute(container) {
  if (!container) return;
  try {
    const rows = await sbGet('/rest/v1/v_daily_kpi_dashboard?tag=eq.' + td() + '&select=*');
    const r = rows && rows[0] ? rows[0] : {};
    const val = function(key) { return Number(r[key] || 0); };
    container.innerHTML =
      '<div class="stat on"><span class="sn">' + val('call_status_wechsel') + '</span><span class="sl">Statuswechsel Call</span></div>' +
      '<div class="stat"><span class="sn">' + val('dm_status_wechsel') + '</span><span class="sl">Statuswechsel DM</span></div>' +
      '<div class="stat"><span class="sn">' + val('termine_call') + '</span><span class="sl">Termine Call</span></div>' +
      '<div class="stat"><span class="sn">' + val('termine_dm') + '</span><span class="sl">Termine DM</span></div>' +
      '<div class="stat"><span class="sn">' + val('closes_call') + '</span><span class="sl">Closes Call</span></div>';
  } catch (e) {
    container.innerHTML = '<p class="dash-empty">Schlagzahl heute konnte nicht geladen werden.</p>';
  }
}

export function initDashboard() {
  if (!_inited) _inited = true;
  renderDashboard();
  Promise.allSettled([loadClients()]).then(renderDashboard);
}

export async function renderDashboard() {
  const root = document.getElementById('dashboard-root');
  if (!root) return;

  try {
    const sessResult = await Promise.allSettled([getSessionStats('week')]);
    if (sessResult[0].status === 'fulfilled') _lastSess = sessResult[0].value || _lastSess;

    root.innerHTML =
      '<div class="dash-layout dash-board">' +
      '<section class="dash-card dash-hero-card">' +
        '<div class="dash-hero-head">' +
          '<div>' +
            '<h3 class="dash-card-title">Performance über Zeit</h3>' +
            '<p class="dash-chart-hint" id="dash-performance-subtitle">Volumen der Kontaktversuche pro Monat</p>' +
          '</div>' +
          '<div class="dash-metric-tabs">' + metricButtonsHtml() + '</div>' +
        '</div>' +
        '<div id="dash-performance-chart"></div>' +
      '</section>' +

      '<div class="dash-channel-grid">' +
        '<section class="dash-card dash-channel-card">' +
          '<div class="dash-channel-head">' +
            '<h3 class="dash-card-title">Cold Calls / Prospecting</h3>' +
            '<button class="btn bs bsm" type="button" data-dash-open="prospecting">Öffnen</button>' +
          '</div>' +
          '<div class="dash-kpi-list">' +
            '<div class="dash-kpi-row"><span>Touches / Anwahlen</span><strong id="dash-call-touches">0</strong></div>' +
            '<div class="dash-kpi-row"><span>Gespräche</span><strong id="dash-call-conversations">0</strong></div>' +
            '<div class="dash-kpi-row"><span>Termine</span><strong id="dash-call-appointments">0</strong></div>' +
            '<div class="dash-kpi-row"><span>Closes</span><strong id="dash-call-closes">0</strong></div>' +
          '</div>' +
          '<p class="dash-channel-rate">Antwortquote: <strong id="dash-call-conv-rate">0%</strong> · Close-Rate: <strong id="dash-call-close-rate">0%</strong></p>' +
        '</section>' +

        '<section class="dash-card dash-channel-card">' +
          '<div class="dash-channel-head">' +
            '<h3 class="dash-card-title">DM-Outbound</h3>' +
            '<button class="btn bs bsm" type="button" data-dash-open="dm">Öffnen</button>' +
          '</div>' +
          '<div class="dash-kpi-list">' +
            '<div class="dash-kpi-row"><span>Touches / Schritte</span><strong id="dash-dm-touches">0</strong></div>' +
            '<div class="dash-kpi-row"><span>Antworten</span><strong id="dash-dm-conversations">0</strong></div>' +
            '<div class="dash-kpi-row"><span>Termine</span><strong id="dash-dm-appointments">0</strong></div>' +
            '<div class="dash-kpi-row"><span>Closes</span><strong id="dash-dm-closes">0</strong></div>' +
          '</div>' +
          '<p class="dash-channel-rate">Antwortquote: <strong id="dash-dm-conv-rate">0%</strong> · Close-Rate: <strong id="dash-dm-close-rate">0%</strong></p>' +
        '</section>' +

        '<section class="dash-card">' +
          '<h3 class="dash-card-title">Schlagzahl heute</h3>' +
          '<div id="dash-schlagzahl" class="stats"></div>' +
        '</section>' +
      '</div>' +
      '<section class="dash-section dash-secondary">' +
        '<button type="button" class="dash-secondary-toggle btn bs bsm" id="dash-secondary-toggle" onclick="toggleDashSecondary()">Sessions ▸</button>' +
        '<div id="dash-secondary-body" class="dash-secondary-body" hidden>' +
          '<section class="dash-card"><h3>Sessions (Woche)</h3>' + renderSessSection(_lastSess) + '</section>' +
        '</div>' +
      '</section></div>';

    bindMetricButtons(root);
    await renderSchlagzahlHeute(document.getElementById('dash-schlagzahl'));
    _channelSeries = await loadChannelSeries();
    updateChannelKpis();
    renderPerformanceChart();
  } catch (e) {
    console.error('Dashboard render:', e);
    root.innerHTML = '<p class="dash-empty">Dashboard konnte nicht geladen werden.</p>';
  }
}

function renderSessSection(sess) {
  if (!sess || !sess.count) return '<p class="dash-empty">Keine Sessions diese Woche.</p>';
  return '<p style="font-size:13px;line-height:1.8">' +
    '<strong>' + sess.count + '</strong> Sessions<br>' +
    '<strong>' + sess.totalLeads + '</strong> Leads gespielt<br>' +
    '<strong>' + Math.round(sess.totalMinutes) + '</strong> Min gesamt</p>';
}
