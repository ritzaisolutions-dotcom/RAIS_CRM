import { loadClients } from './clients.js';
import { navigateTo } from './sidebar.js';
import { setF, filterDue } from './prospecting.js';
import { getSessionStats } from './sessions.js';
import {
  computeFunnel, revenueAllTime,
  touchVolumeSeries, settingRateMonthlySeries, closingRateMonthlySeries,
  revenueMonthlySeries, renderVolumeChart, renderSingleLineChart, renderRevenueChart,
} from './analytics.js';

const TOUCH_DAYS = 30;
const RATE_MONTHS = 6;
const REVENUE_MONTHS = 6;

let _inited = false;
let _lastSess = { count: 0, totalLeads: 0, totalMinutes: 0 };

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

function formatEur(n) {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n);
}

function kpiCard(n, label, action, tone) {
  const click = action ? ' dash-kpi-click" role="button" tabindex="0" onclick="' + action + '"' : '"';
  const toneCls = tone === 'positive' ? ' dash-kpi--positive' : '';
  return '<div class="dash-kpi' + toneCls + click + '>' +
    '<span class="dash-kpi-n">' + n + '</span>' +
    '<span class="dash-kpi-l">' + label + '</span></div>';
}

function refreshKpiStrip(container) {
  const week = computeFunnel('week');
  const month = computeFunnel('month');
  container.innerHTML =
    kpiCard(formatEur(revenueAllTime()), 'Revenue Gesamt', 'dashGoProspecting(\'closed\')', 'positive') +
    kpiCard(formatEur(month.revenueEur), 'Revenue (Monat)', 'dashGoProspecting(\'closed\')', 'positive') +
    kpiCard(formatEur(week.revenueEur), 'Revenue (Woche)', 'dashGoProspecting(\'closed\')', 'positive');
}

function renderDashboardCharts() {
  renderVolumeChart(
    document.getElementById('dash-touches-chart'),
    touchVolumeSeries('day', TOUCH_DAYS),
    { key: 'touches', barMax: 180 },
  );
  renderSingleLineChart(
    document.getElementById('dash-setting-chart'),
    settingRateMonthlySeries(RATE_MONTHS),
    { label: 'Setting /100', color: '#1A7A40' },
  );
  renderSingleLineChart(
    document.getElementById('dash-closing-chart'),
    closingRateMonthlySeries(RATE_MONTHS),
    { label: 'Closing /100', color: '#0A5C24', dashed: true },
  );
  renderRevenueChart(
    document.getElementById('dash-revenue-chart'),
    revenueMonthlySeries(REVENUE_MONTHS),
  );
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
      '<div class="dash-layout">' +
      '<div class="dash-kpis"></div>' +
      '<div class="dash-stack">' +
        '<div class="dash-card dash-chart-hero">' +
          '<h3 class="dash-card-title">Touches pro Tag</h3>' +
          '<div id="dash-touches-chart"></div>' +
          '<p class="dash-chart-hint">Letzte ' + TOUCH_DAYS + ' Tage — Outreach-Disziplin</p>' +
        '</div>' +
        '<div class="dash-card dash-chart-sm">' +
          '<h3 class="dash-card-title">Setting Rate / 100 Touches</h3>' +
          '<div id="dash-setting-chart"></div>' +
        '</div>' +
        '<div class="dash-card dash-chart-sm">' +
          '<h3 class="dash-card-title">Closing Rate / 100 Touches</h3>' +
          '<div id="dash-closing-chart"></div>' +
        '</div>' +
        '<div class="dash-card">' +
          '<h3 class="dash-card-title">Revenue</h3>' +
          '<div id="dash-revenue-chart"></div>' +
          '<p class="dash-chart-hint">Stripe-Anbindung folgt</p>' +
        '</div>' +
      '</div>' +
      '<section class="dash-section dash-secondary">' +
        '<button type="button" class="dash-secondary-toggle btn bs bsm" id="dash-secondary-toggle" onclick="toggleDashSecondary()">Sessions ▸</button>' +
        '<div id="dash-secondary-body" class="dash-secondary-body" hidden>' +
          '<section class="dash-card"><h3>Sessions (Woche)</h3>' + renderSessSection(_lastSess) + '</section>' +
        '</div>' +
      '</section>' +
      '</div>';

    refreshKpiStrip(root.querySelector('.dash-kpis'));
    renderDashboardCharts();
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
