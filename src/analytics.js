import { S } from './state.js';
import { weekStart } from './utils.js';

export { weekStart };

function parseDate(s) {
  if (!s) return null;
  const d = new Date(s.length === 10 ? s + 'T12:00:00' : s);
  return isNaN(d.getTime()) ? null : d;
}

function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function periodRange(period) {
  const now = new Date();
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);
  let start;
  if (period === 'week') {
    start = weekStart(now);
  } else if (period === 'prev_week') {
    start = weekStart(now);
    start.setDate(start.getDate() - 7);
    const prevEnd = new Date(start);
    prevEnd.setDate(prevEnd.getDate() + 6);
    prevEnd.setHours(23, 59, 59, 999);
    return { start, end: prevEnd };
  } else if (period === 'month') {
    start = new Date(now.getFullYear(), now.getMonth(), 1);
  } else {
    const days = typeof period === 'number' ? period : 7;
    start = startOfDay(now);
    start.setDate(start.getDate() - (days - 1));
  }
  return { start, end };
}

function inRange(date, start, end) {
  return date && date >= start && date <= end;
}

function countTouchesInRange(start, end) {
  let n = 0;
  (S.contacts || []).forEach(function(c) {
    (c.touches || []).forEach(function(t) {
      const d = parseDate(t.datum);
      if (d && inRange(d, start, end)) n++;
    });
  });
  return n;
}

function countDemosInRange(start, end) {
  let n = 0;
  (S.contacts || []).forEach(function(c) {
    const sc = parseDate(c.status_changed_at);
    if (c.status === 'set_appointment' && inRange(sc, start, end)) { n++; return; }
    (c.touches || []).forEach(function(t) {
      const d = parseDate(t.datum);
      if (d && inRange(d, start, end) && (t.status === 'Termin vereinbart' || t.status === 'Set Appointment' || t.status === 'Demo Termin')) n++;
    });
  });
  return n;
}

function countWonInRange(start, end) {
  return (S.contacts || []).filter(function(c) {
    if (c.status !== 'closed') return false;
    const sc = parseDate(c.status_changed_at);
    return inRange(sc, start, end);
  }).length;
}

function revenueInRange(start, end) {
  let sum = 0;
  (S.contacts || []).forEach(function(c) {
    if (c.status !== 'closed') return;
    const sc = parseDate(c.status_changed_at);
    if (!inRange(sc, start, end)) return;
    const v = parseFloat(c.deal_value_eur);
    sum += isNaN(v) ? 1800 : v;
  });
  return sum;
}

function funnelStages() {
  const contacts = S.contacts || [];
  const dials = contacts.reduce(function(n, c) {
    return n + (c.touches || []).filter(function(t) { return t.datum; }).length;
  }, 0);
  const demos = contacts.filter(function(c) { return c.status === 'set_appointment'; }).length;
  const won = contacts.filter(function(c) { return c.status === 'closed'; }).length;
  return { dials, demos, won };
}

export function computeFunnel(period) {
  const { start, end } = periodRange(period);
  const dials = countTouchesInRange(start, end);
  const demosSet = countDemosInRange(start, end);
  const won = countWonInRange(start, end);
  const settingRatePer100 = dials > 0 ? Math.round((demosSet / dials) * 1000) / 10 : 0;
  const closingDenom = demosSet + won;
  const closingRatePct = closingDenom > 0 ? Math.round((won / closingDenom) * 1000) / 10 : 0;
  const revenueEur = revenueInRange(start, end);
  const stages = funnelStages();
  return {
    dials, demosSet, won, settingRatePer100, closingRatePct, revenueEur,
    stages, start, end,
  };
}

export function dailyTouchSeries(days) {
  const n = days || 7;
  const now = startOfDay(new Date());
  const series = [];
  for (let i = n - 1; i >= 0; i--) {
    const day = new Date(now);
    day.setDate(day.getDate() - i);
    const next = new Date(day);
    next.setDate(next.getDate() + 1);
    let count = 0;
    (S.contacts || []).forEach(function(c) {
      (c.touches || []).forEach(function(t) {
        const d = parseDate(t.datum);
        if (d && d >= day && d < next) count++;
      });
    });
    series.push({
      label: day.toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric' }),
      count,
    });
  }
  return series;
}

export function renderTrendChart(container, dailySeries) {
  if (!container) return;
  const max = Math.max.apply(null, dailySeries.map(function(d) { return d.count; }).concat([1]));
  container.innerHTML = '<div class="chart-bar">' + dailySeries.map(function(d) {
    const h = Math.round((d.count / max) * 72);
    return '<div class="chart-bar-col">' +
      '<div class="chart-bar-fill" style="height:' + h + 'px" title="' + d.count + '"></div>' +
      '<span class="chart-bar-label">' + d.label + '</span></div>';
  }).join('') + '</div>';
}

export function renderFunnelChart(container, data) {
  if (!container) return;
  const s = data.stages || funnelStages();
  const max = Math.max(s.dials, s.demos, s.won, 1);
  function step(label, n, cls) {
    const w = Math.max(8, Math.round((n / max) * 100));
    return '<div class="chart-funnel-step">' +
      '<span class="chart-funnel-l">' + label + '</span>' +
      '<div class="chart-funnel-bar' + (cls ? ' ' + cls : '') + '" style="width:' + w + '%"></div>' +
      '<span class="chart-funnel-n">' + n + '</span></div>';
  }
  container.innerHTML = '<div class="chart-funnel">' +
    step('Dials', s.dials, '') +
    step('Set Appointment', s.demos, '') +
    step('Closed', s.won, 'chart-funnel-bar--won') +
  '</div>';
}

export function deltaHtml(cur, prev) {
  if (prev === 0 && cur === 0) return '<span class="kpi-delta-flat">—</span>';
  if (prev === 0) return '<span class="kpi-delta-up">+' + cur + '</span>';
  const pct = Math.round(((cur - prev) / prev) * 100);
  if (pct > 0) return '<span class="kpi-delta-up">+' + pct + '%</span>';
  if (pct < 0) return '<span class="kpi-delta-down">' + pct + '%</span>';
  return '<span class="kpi-delta-flat">0%</span>';
}
