import { S } from './state.js';
import { isColdLead } from './utils.js';
import { loadClients } from './clients.js';
import { loadProjects, getProjectsSnapshot } from './projects.js';
import { esc } from './ui.js';
import { navigateTo } from './sidebar.js';
import { setF, filterDue } from './prospecting.js';
import { getSessionStats } from './sessions.js';
import { fetchCalendarWeek } from './integrations.js';
import {
  computeFunnel, dailyTouchSeries, renderFunnelChart, renderTrendChart, deltaHtml,
} from './analytics.js';

let _inited = false;

window.addEventListener('rais:page-change', function(e) {
  if (e.detail.page === 'dashboard') initDashboard();
});

export function dashGoProspecting(filter) {
  navigateTo('prospecting');
  if (filter === 'due') filterDue();
  else setF(filter || 'all');
}

export function dashGoClients() {
  navigateTo('clients');
}

export function dashGoProjects() {
  navigateTo('projects');
}

function kpiCard(n, label, delta, action) {
  const click = action ? ' dash-kpi-click" role="button" tabindex="0" onclick="' + action + '"' : '"';
  return '<div class="dash-kpi' + click + '>' +
    '<span class="dash-kpi-n">' + n + '</span>' +
    (delta ? '<span class="dash-kpi-d">' + delta + '</span>' : '') +
    '<span class="dash-kpi-l">' + label + '</span></div>';
}

function formatEur(n) {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n);
}

export function initDashboard() {
  if (!_inited) _inited = true;
  renderDashboard();
  Promise.allSettled([loadClients(), loadProjects()]).then(renderDashboard);
}

export async function renderDashboard() {
  const root = document.getElementById('dashboard-root');
  if (!root) return;

  try {
    const week = computeFunnel('week');
    const prevWeek = computeFunnel('prev_week');
    const contacts = S.contacts || [];
    const cold = contacts.filter(isColdLead).length;
    const demosTotal = contacts.filter(function(c) { return c.status === 'demo_termin'; }).length;

    let calEvents = [];
    try {
      calEvents = await fetchCalendarWeek();
    } catch (_) {
      calEvents = [];
    }

    let sess = { count: 0, totalLeads: 0, totalMinutes: 0 };
    try {
      sess = await getSessionStats('week');
    } catch (_) {
      /* Sessions-Tabelle optional */
    }

    const snap = getProjectsSnapshot();

    root.innerHTML =
      '<div class="dash-kpis">' +
        kpiCard(week.dials, 'Leads angesprochen (Woche)', deltaHtml(week.dials, prevWeek.dials), 'dashGoProspecting(\'all\')') +
        kpiCard(cold, 'Kalte Leads', '', 'dashGoProspecting(\'kalt\')') +
        kpiCard(demosTotal + (calEvents.length ? ' / ' + calEvents.length : ''), 'Termine (CRM / Kalender)', '', 'dashGoProspecting(\'demo_termin\')') +
        kpiCard(formatEur(week.revenueEur), 'Revenue (Woche)', deltaHtml(week.revenueEur, prevWeek.revenueEur), 'dashGoProspecting(\'gewonnen\')') +
      '</div>' +

      '<div class="dash-grid dash-charts">' +
        '<section class="dash-card"><h3>Dials / Touches (7 Tage)</h3><div id="dash-trend"></div></section>' +
        '<section class="dash-card"><h3>Akquise-Funnel</h3><div id="dash-funnel"></div></section>' +
        '<section class="dash-card"><h3>Setting Rate <span style="font-weight:400;color:var(--st)">pro 100 Dials</span></h3>' +
          '<p style="font-size:28px;font-weight:800;color:var(--or);margin:8px 0">' + week.settingRatePer100 + '</p>' +
          '<p style="font-size:12px;color:var(--st)">Vorwoche: ' + prevWeek.settingRatePer100 + '</p></section>' +
        '<section class="dash-card"><h3>Closing Rate</h3>' +
          '<div class="dash-bar-track" style="height:12px;margin:12px 0"><div class="dash-bar-fill" style="width:' + week.closingRatePct + '%;background:var(--sg)"></div></div>' +
          '<p style="font-size:22px;font-weight:800;color:var(--sg-dark)">' + week.closingRatePct + '%</p></section>' +
      '</div>' +

      '<div class="dash-grid">' +
        '<section class="dash-card"><h3>Wochen-To-dos</h3>' + renderTodosSection(snap.openTodos) + '</section>' +
        '<section class="dash-card"><h3>Kalender diese Woche</h3>' + renderCalSection(calEvents) + '</section>' +
      '</div>' +

      '<div class="dash-grid">' +
        '<section class="dash-card"><h3>Projekte</h3>' + renderProjSnap(snap.projects) + '</section>' +
        '<section class="dash-card"><h3>Sessions (Woche)</h3>' + renderSessSection(sess) + '</section>' +
      '</div>';

    try {
      renderTrendChart(document.getElementById('dash-trend'), dailyTouchSeries(7));
      renderFunnelChart(document.getElementById('dash-funnel'), week);
    } catch (_) {
      /* Charts optional */
    }
  } catch (e) {
    console.error('Dashboard render:', e);
    root.innerHTML =
      '<div class="dash-kpis">' +
        kpiCard(0, 'Leads angesprochen (Woche)', '', 'dashGoProspecting(\'all\')') +
        kpiCard(0, 'Kalte Leads', '', 'dashGoProspecting(\'kalt\')') +
        kpiCard(0, 'Termine (CRM / Kalender)', '', 'dashGoProspecting(\'demo_termin\')') +
        kpiCard(formatEur(0), 'Revenue (Woche)', '', 'dashGoProspecting(\'gewonnen\')') +
      '</div>' +
      '<p class="dash-empty">Einige Dashboard-Daten konnten nicht geladen werden.</p>';
  }
}

function renderTodosSection(todos) {
  const weekTodos = (todos || []).slice(0, 8);
  if (!weekTodos.length) return '<p class="dash-empty">Keine offenen To-dos.</p>';
  return '<ul class="dash-todo-list">' + weekTodos.map(function(t) {
    return '<li class="dash-todo-item"><span>' + esc(t.title) + '</span>' +
      '<span style="font-size:11px;color:var(--st)">' + esc(t.due_date || '') + '</span></li>';
  }).join('') + '</ul><button class="btn bs bsm" onclick="dashGoProjects()" style="margin-top:8px">Alle Projekte</button>';
}

function renderCalSection(events) {
  if (!events.length) return '<p class="dash-empty">Keine Termine geladen (WF10 prüfen).</p>';
  return '<ul class="dash-todo-list">' + events.slice(0, 6).map(function(ev) {
    const start = ev.start ? new Date(ev.start).toLocaleString('de-DE', { weekday: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
    const link = ev.htmlLink ? ' <a href="' + esc(ev.htmlLink) + '" target="_blank" rel="noopener">↗</a>' : '';
    return '<li class="dash-todo-item"><span>' + esc(ev.summary || 'Termin') + link + '</span><span style="font-size:11px;color:var(--st)">' + esc(start) + '</span></li>';
  }).join('') + '</ul>';
}

function renderProjSnap(projects) {
  if (!projects.length) return '<p class="dash-empty">Keine Projekte.</p>';
  return projects.slice(0, 4).map(function(p) {
    return '<div class="dash-bar-row"><span class="dash-bar-label">' + esc(p.name) + '</span>' +
      '<div class="dash-bar-track"><div class="dash-bar-fill" style="width:' + (p.progress_pct || 0) + '%;background:var(--sg)"></div></div>' +
      '<span class="dash-bar-n">' + (p.progress_pct || 0) + '%</span></div>';
  }).join('') + '<button class="btn bs bsm" onclick="dashGoProjects()" style="margin-top:8px">Projekte öffnen</button>';
}

function renderSessSection(sess) {
  if (!sess || !sess.count) return '<p class="dash-empty">Keine Sessions diese Woche.</p>';
  return '<p style="font-size:13px;line-height:1.8">' +
    '<strong>' + sess.count + '</strong> Sessions<br>' +
    '<strong>' + sess.totalLeads + '</strong> Leads gespielt<br>' +
    '<strong>' + Math.round(sess.totalMinutes) + '</strong> Min gesamt</p>';
}
