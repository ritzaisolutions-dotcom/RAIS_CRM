import { S } from './state.js';
import { loadClients } from './clients.js';
import { loadProjects, getProjectsSnapshot, todoCategoryLabel } from './projects.js';
import { fetchContentSnapshot } from './content.js';
import {
  buildOutreachMix, fetchActivitySnapshot, getTodayActivity, upsertActivityDaily,
} from './activity.js';
import { esc, toast } from './ui.js';
import { navigateTo } from './sidebar.js';
import { setF, filterDue } from './prospecting.js';
import { getSessionStats } from './sessions.js';
import { fetchCalendarWeek } from './integrations.js';
import {
  computeFunnel, deltaHtml, periodRange,
  rateSeries, touchVolumeSeries, contentLiveSeries, revenueWeeklySeries,
  countContentLiveInRange, renderDualLineChart, renderVolumeChart,
  renderPlatformLineChart, renderPieChart, renderRevenueChart,
} from './analytics.js';

const GRAIN_KEY = 'rais_dash_grain';
const PLATFORM_COLORS = {
  youtube: '#CC0000',
  instagram: '#833AB4',
  linkedin: '#0A66C2',
};

let _inited = false;
let _dashGrain = localStorage.getItem(GRAIN_KEY) || 'week';
let _contentItems = [];
let _activityRows = [];
let _lastSnap = null;
let _lastCal = [];
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
export function dashGoProjects() { navigateTo('projects'); }
export function dashGoContent() { navigateTo('content'); }

export function toggleDashSecondary() {
  const body = document.getElementById('dash-secondary-body');
  const btn = document.getElementById('dash-secondary-toggle');
  if (!body || !btn) return;
  const open = body.hidden;
  body.hidden = !open;
  btn.textContent = open ? 'Operativ ▾' : 'Operativ ▸';
}

export function setDashGrain(grain) {
  _dashGrain = grain === 'day' || grain === 'month' ? grain : 'week';
  localStorage.setItem(GRAIN_KEY, _dashGrain);
  renderDashboardCharts();
  document.querySelectorAll('.dash-grain-btn').forEach(function(btn) {
    btn.classList.toggle('on', btn.dataset.grain === _dashGrain);
  });
}

export async function saveActivityLog() {
  const dm = document.getElementById('actDm');
  const meta = document.getElementById('actMeta');
  if (!dm || !meta) return;
  try {
    await upsertActivityDaily(null, {
      linkedin_dm_manual: dm.value,
      meta_ads_inbound_manual: meta.value,
    });
    _activityRows = await fetchActivitySnapshot(120);
    toast('Tageslog gespeichert.');
    renderDashboardCharts();
    const kpiStrip = document.querySelector('.dash-kpis');
    if (kpiStrip && _lastSnap) refreshKpiStrip(kpiStrip, _lastSnap);
  } catch (e) {
    toast('Speichern fehlgeschlagen: ' + e.message);
  }
}

function formatEur(n) {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n);
}

function grainToggleHtml() {
  return '<div class="dash-grain-toggle">' +
    ['day', 'week', 'month'].map(function(g) {
      const labels = { day: 'Tag', week: 'Woche', month: 'Monat' };
      return '<button type="button" class="dash-grain-btn' + (_dashGrain === g ? ' on' : '') +
        '" data-grain="' + g + '" onclick="setDashGrain(\'' + g + '\')">' + labels[g] + '</button>';
    }).join('') +
  '</div>';
}

function kpiCard(n, label, delta, action, tone, sub) {
  const click = action ? ' dash-kpi-click" role="button" tabindex="0" onclick="' + action + '"' : '"';
  const toneCls = tone === 'positive' ? ' dash-kpi--positive' : '';
  return '<div class="dash-kpi' + toneCls + click + '>' +
    '<span class="dash-kpi-n">' + n + '</span>' +
    (delta ? '<span class="dash-kpi-d">' + delta + '</span>' : '') +
    (sub ? '<span class="dash-kpi-sub">' + sub + '</span>' : '') +
    '<span class="dash-kpi-l">' + label + '</span></div>';
}

function periodForGrain() {
  if (_dashGrain === 'day') return periodRange(12);
  if (_dashGrain === 'month') {
    const ranges = [];
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth() - 5, 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    return { start, end };
  }
  const start = new Date();
  start.setDate(start.getDate() - 55);
  start.setHours(0, 0, 0, 0);
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

function refreshKpiStrip(container, snap) {
  const week = snap.week;
  const prevWeek = snap.prevWeek;
  const month = snap.month;
  const prevMonth = snap.prevMonth;
  const outreach = buildOutreachMix(week.start, week.end, _contentItems, _activityRows);
  container.innerHTML =
    kpiCard(week.dials, 'Touches (Woche)', deltaHtml(week.dials, prevWeek.dials), 'dashGoProspecting(\'all\')', '', week.settingRatePer100 + ' /100 Setting') +
    kpiCard(week.settingRatePer100, 'Setting /100', deltaHtml(week.settingRatePer100, prevWeek.settingRatePer100), 'dashGoProspecting(\'set_appointment\')', 'positive', week.demosSet + ' Termine') +
    kpiCard(week.closingRatePer100, 'Closing /100', deltaHtml(week.closingRatePer100, prevWeek.closingRatePer100), 'dashGoProspecting(\'closed\')', 'positive', week.won + ' Closed') +
    '<div class="dash-kpi dash-kpi--positive dash-kpi-split dash-kpi-click" role="button" tabindex="0" onclick="dashGoProspecting(\'closed\')">' +
      '<div class="dash-kpi-split-row">' +
        '<div><span class="dash-kpi-n dash-kpi-n-sm">' + formatEur(week.revenueEur) + '</span><span class="dash-kpi-l">Revenue Woche</span></div>' +
        '<div><span class="dash-kpi-n dash-kpi-n-sm">' + formatEur(month.revenueEur) + '</span><span class="dash-kpi-l">Revenue Monat</span></div>' +
      '</div>' +
      '<span class="dash-kpi-d">' + deltaHtml(week.revenueEur, prevWeek.revenueEur) + ' W · ' + deltaHtml(month.revenueEur, prevMonth.revenueEur) + ' M</span>' +
    '</div>' +
    kpiCard(snap.contentWeek, 'Content Live (Woche)', '', 'dashGoContent()', 'positive', 'YT ' + snap.contentYt + ' · IG ' + snap.contentIg + ' · LI ' + snap.contentLi) +
    kpiCard(outreach.total, 'Outreach gesamt (Woche)', '', '', '', 'Mix aus Calls, DMs, Ads, Content');
}

function renderDashboardCharts() {
  const grain = _dashGrain;
  const rateData = rateSeries(grain);
  const touchData = touchVolumeSeries(grain);
  const { start, end } = periodForGrain();
  const outreach = buildOutreachMix(start, end, _contentItems, _activityRows);

  renderDualLineChart(document.getElementById('dash-rate-chart'), rateData);
  renderVolumeChart(document.getElementById('dash-touch-chart'), touchData, { key: 'touches' });
  renderVolumeChart(document.getElementById('dash-touch-call-chart'), touchData, { key: 'callTouches', cls: 'chart-bar-fill--call' });
  renderVolumeChart(document.getElementById('dash-touch-dm-chart'), touchData, { key: 'dms', cls: 'chart-bar-fill--linkedin' });
  renderPlatformLineChart(document.getElementById('dash-content-yt'), contentLiveSeries(grain, null, 'youtube', _contentItems), PLATFORM_COLORS.youtube);
  renderPlatformLineChart(document.getElementById('dash-content-ig'), contentLiveSeries(grain, null, 'instagram', _contentItems), PLATFORM_COLORS.instagram);
  renderPlatformLineChart(document.getElementById('dash-content-li'), contentLiveSeries(grain, null, 'linkedin', _contentItems), PLATFORM_COLORS.linkedin);
  renderPieChart(document.getElementById('dash-outreach-pie'), outreach);
  renderRevenueChart(document.getElementById('dash-revenue-chart'), revenueWeeklySeries(8));

  const hint = document.getElementById('dash-rate-hint');
  if (hint && rateData.length) {
    const last = rateData[rateData.length - 1];
    hint.textContent = 'Aktuell: Setting ' + last.settingRatePer100 + '/100 · Closing ' + last.closingRatePer100 + '/100';
  }
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
    const month = computeFunnel('month');
    const prevMonth = computeFunnel('prev_month');

    const results = await Promise.allSettled([
      fetchContentSnapshot(),
      fetchActivitySnapshot(120),
      fetchCalendarWeek(),
      getSessionStats('week'),
      getTodayActivity(),
    ]);
    if (results[0].status === 'fulfilled') _contentItems = results[0].value || [];
    if (results[1].status === 'fulfilled') _activityRows = results[1].value || [];
    if (results[2].status === 'fulfilled') _lastCal = results[2].value || [];
    if (results[3].status === 'fulfilled') _lastSess = results[3].value || _lastSess;
    const todayAct = results[4].status === 'fulfilled' ? results[4].value : { linkedin_dm_manual: 0, meta_ads_inbound_manual: 0 };

    const { start: wStart, end: wEnd } = week;
    const snap = {
      week, prevWeek, month, prevMonth,
      contentWeek: countContentLiveInRange(_contentItems, wStart, wEnd),
      contentYt: countContentLiveInRange(_contentItems, wStart, wEnd, 'youtube'),
      contentIg: countContentLiveInRange(_contentItems, wStart, wEnd, 'instagram'),
      contentLi: countContentLiveInRange(_contentItems, wStart, wEnd, 'linkedin'),
      openTodos: getProjectsSnapshot().openTodos,
      projects: getProjectsSnapshot().projects,
    };
    _lastSnap = snap;

    root.innerHTML =
      '<div class="dash-kpis"></div>' +
      grainToggleHtml() +

      '<section class="dash-section">' +
        '<h2 class="dash-section-title">Setting & Closing pro 100 Touches</h2>' +
        '<div class="dash-card dash-card-wide"><div id="dash-rate-chart"></div>' +
          '<p class="dash-chart-hint" id="dash-rate-hint"></p></div>' +
      '</section>' +

      '<section class="dash-section">' +
        '<h2 class="dash-section-title">Touch-Volumen</h2>' +
        '<div class="dash-card dash-card-wide"><div id="dash-touch-chart"></div>' +
          '<p class="dash-chart-hint">Gesamt-Touches</p></div>' +
        '<div class="dash-grid dash-grid-2">' +
          '<div class="dash-card"><h3>Calls</h3><div id="dash-touch-call-chart"></div></div>' +
          '<div class="dash-card"><h3>LinkedIn DM (CRM)</h3><div id="dash-touch-dm-chart"></div></div>' +
        '</div>' +
      '</section>' +

      '<section class="dash-section">' +
        '<h2 class="dash-section-title">Revenue (8 Wochen)</h2>' +
        '<div class="dash-card dash-card-wide"><div id="dash-revenue-chart"></div></div>' +
      '</section>' +

      '<section class="dash-section">' +
        '<h2 class="dash-section-title">Content Live</h2>' +
        '<div class="dash-grid dash-grid-3">' +
          '<div class="dash-card dash-card-platform dash-card-platform--yt"><h3>YouTube</h3><div id="dash-content-yt"></div></div>' +
          '<div class="dash-card dash-card-platform dash-card-platform--ig"><h3>Instagram</h3><div id="dash-content-ig"></div></div>' +
          '<div class="dash-card dash-card-platform dash-card-platform--li"><h3>LinkedIn</h3><div id="dash-content-li"></div></div>' +
        '</div>' +
      '</section>' +

      '<section class="dash-section">' +
        '<h2 class="dash-section-title">Outreach-Mix</h2>' +
        '<div class="dash-grid dash-grid-2">' +
          '<div class="dash-card"><div id="dash-outreach-pie"></div></div>' +
          '<div class="dash-card dash-activity-log">' +
            '<h3>Heute loggen</h3>' +
            '<p class="dash-chart-hint">Manuell + CRM (DMs dedupliziert im Pie)</p>' +
            '<div class="fr2">' +
              '<div><label>LinkedIn DMs gesendet</label><input type="number" class="fs2" id="actDm" min="0" value="' + (todayAct.linkedin_dm_manual || 0) + '"></div>' +
              '<div><label>Meta Ads Inbound</label><input type="number" class="fs2" id="actMeta" min="0" value="' + (todayAct.meta_ads_inbound_manual || 0) + '"></div>' +
            '</div>' +
            '<button type="button" class="btn bp bsm" onclick="saveActivityLog()" style="margin-top:10px">Speichern</button>' +
          '</div>' +
        '</div>' +
      '</section>' +

      '<section class="dash-section dash-secondary">' +
        '<button type="button" class="dash-secondary-toggle btn bs bsm" id="dash-secondary-toggle" onclick="toggleDashSecondary()">Operativ ▸</button>' +
        '<div id="dash-secondary-body" class="dash-secondary-body" hidden>' +
          '<div class="dash-grid">' +
            '<section class="dash-card"><h3>Wochen-To-dos</h3>' + renderTodosSection(snap.openTodos) + '</section>' +
            '<section class="dash-card"><h3>Kalender diese Woche</h3>' + renderCalSection(_lastCal) + '</section>' +
          '</div>' +
          '<div class="dash-grid">' +
            '<section class="dash-card"><h3>Projekte</h3>' + renderProjSnap(snap.projects) + '</section>' +
            '<section class="dash-card"><h3>Sessions (Woche)</h3>' + renderSessSection(_lastSess) + '</section>' +
          '</div>' +
        '</div>' +
      '</section>';

    refreshKpiStrip(root.querySelector('.dash-kpis'), snap);
    renderDashboardCharts();
  } catch (e) {
    console.error('Dashboard render:', e);
    root.innerHTML = '<p class="dash-empty">Dashboard konnte nicht geladen werden.</p>';
  }
}

function renderTodosSection(todos) {
  const weekTodos = (todos || []).slice(0, 8);
  if (!weekTodos.length) return '<p class="dash-empty">Keine offenen To-dos.</p>';
  return '<ul class="dash-todo-list">' + weekTodos.map(function(t) {
    return '<li class="dash-todo-item"><span>' + esc(t.title) +
      ' <span style="font-size:10px;color:var(--st);opacity:.85">' + esc(todoCategoryLabel(t.category)) + '</span></span>' +
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
