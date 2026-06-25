import { S, POSITIVE_STATUSES } from './state.js';
import { weekStart } from './utils.js';
import { esc } from './ui.js';

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
  } else if (period === 'prev_month') {
    start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
    return { start, end: prevEnd };
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

const APPT_TOUCH_LABELS = ['Set Appointment', 'Termin vereinbart', 'Demo Termin'];
const LINKEDIN_DM_LABEL = 'LinkedIn DM';
const CONTENT_PLATFORMS = ['youtube', 'instagram', 'linkedin'];

function isoWeekNumber(d) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return Math.ceil((((t - yearStart) / 86400000) + 1) / 7);
}

export function weeklyRanges(weeks) {
  const n = weeks || 8;
  const ranges = [];
  const thisMonday = weekStart(new Date());
  for (let i = n - 1; i >= 0; i--) {
    const start = new Date(thisMonday);
    start.setDate(start.getDate() - i * 7);
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    end.setHours(23, 59, 59, 999);
    ranges.push({ start, end, label: 'KW ' + isoWeekNumber(start) });
  }
  return ranges;
}

export function weeklySeries(weeks, metricFn) {
  return weeklyRanges(weeks).map(function(r) {
    return Object.assign({ label: r.label }, metricFn(r.start, r.end));
  });
}

export const GRAIN_POINTS = { day: 12, week: 8, month: 6 };

export function dailyRanges(days) {
  const n = days || GRAIN_POINTS.day;
  const ranges = [];
  const now = startOfDay(new Date());
  for (let i = n - 1; i >= 0; i--) {
    const start = new Date(now);
    start.setDate(start.getDate() - i);
    const end = new Date(start);
    end.setHours(23, 59, 59, 999);
    ranges.push({
      start, end,
      label: start.toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric' }),
    });
  }
  return ranges;
}

export function monthlyRanges(months) {
  const n = months || GRAIN_POINTS.month;
  const ranges = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const end = new Date(start.getFullYear(), start.getMonth() + 1, 0, 23, 59, 59, 999);
    ranges.push({
      start, end,
      label: start.toLocaleDateString('de-DE', { month: 'short', year: '2-digit' }),
    });
  }
  return ranges;
}

export function rangesForGrain(grain, count) {
  if (grain === 'day') return dailyRanges(count || GRAIN_POINTS.day);
  if (grain === 'month') return monthlyRanges(count || GRAIN_POINTS.month);
  return weeklyRanges(count || GRAIN_POINTS.week);
}

export function closingRatePer100(touches, won) {
  return touches > 0 ? Math.round((won / touches) * 1000) / 10 : 0;
}

export function funnelMetricsForRange(start, end) {
  const touches = countTouchesInRange(start, end);
  const demosSet = countDemosInRange(start, end);
  const won = countWonInRange(start, end);
  return {
    touches, demosSet, won,
    revenueEur: revenueInRange(start, end),
    settingRatePer100: touches > 0 ? Math.round((demosSet / touches) * 1000) / 10 : 0,
    closingRatePer100: closingRatePer100(touches, won),
  };
}

export function countCallTouchesInRange(start, end) {
  let n = 0;
  (S.contacts || []).forEach(function(c) {
    (c.touches || []).forEach(function(t) {
      const d = parseDate(t.datum);
      if (d && inRange(d, start, end) && t.status !== LINKEDIN_DM_LABEL) n++;
    });
  });
  return n;
}

export function rateSeries(grain, count) {
  return rangesForGrain(grain, count).map(function(r) {
    const m = funnelMetricsForRange(r.start, r.end);
    return {
      label: r.label,
      settingRatePer100: m.settingRatePer100,
      closingRatePer100: m.closingRatePer100,
    };
  });
}

export function touchVolumeSeries(grain, count) {
  return rangesForGrain(grain, count).map(function(r) {
    return {
      label: r.label,
      touches: countTouchesInRange(r.start, r.end),
      callTouches: countCallTouchesInRange(r.start, r.end),
      dms: countLinkedInDmsInRange(r.start, r.end),
    };
  });
}

export function contentLiveSeries(grain, count, platform, items) {
  return rangesForGrain(grain, count).map(function(r) {
    return {
      label: r.label,
      count: countContentLiveInRange(items, r.start, r.end, platform || null),
    };
  });
}

export function contentLiveMultiSeries(grain, items, count) {
  return rangesForGrain(grain, count).map(function(r) {
    return {
      label: r.label,
      youtube: countContentLiveInRange(items, r.start, r.end, 'youtube'),
      instagram: countContentLiveInRange(items, r.start, r.end, 'instagram'),
      linkedin: countContentLiveInRange(items, r.start, r.end, 'linkedin'),
    };
  });
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
      if (d && inRange(d, start, end) && APPT_TOUCH_LABELS.indexOf(t.status) >= 0) n++;
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
  const positive = contacts.filter(function(c) { return POSITIVE_STATUSES.indexOf(c.status) >= 0; }).length;
  return { dials, demos, won, positive };
}

/** LinkedIn-DM-Touches im Zeitraum */
export function countLinkedInDmsInRange(start, end) {
  let n = 0;
  (S.contacts || []).forEach(function(c) {
    (c.touches || []).forEach(function(t) {
      const d = parseDate(t.datum);
      if (d && inRange(d, start, end) && t.status === LINKEDIN_DM_LABEL) n++;
    });
  });
  return n;
}

function contentLiveDate(item) {
  if (item.status !== 'live') return null;
  return parseDate(item.publish_date) || parseDate(item.created_at);
}

function contentPlatform(item) {
  return (item.platforms || 'youtube').split(',')[0].trim().toLowerCase();
}

export function countContentLiveInRange(items, start, end, platform) {
  let n = 0;
  (items || []).forEach(function(item) {
    const d = contentLiveDate(item);
    if (!d || !inRange(d, start, end)) return;
    if (platform && contentPlatform(item) !== platform) return;
    n++;
  });
  return n;
}

export function akquiseWeeklySeries(weeks) {
  return weeklySeries(weeks, function(start, end) {
    const touches = countTouchesInRange(start, end);
    const demosSet = countDemosInRange(start, end);
    const settingRatePer100 = touches > 0 ? Math.round((demosSet / touches) * 1000) / 10 : 0;
    return { touches, demosSet, settingRatePer100 };
  });
}

export function revenueWeeklySeries(weeks) {
  return weeklySeries(weeks, function(start, end) {
    return { revenueEur: revenueInRange(start, end) };
  });
}

export function revenueMonthlySeries(months) {
  return monthlyRanges(months || GRAIN_POINTS.month).map(function(r) {
    return { label: r.label, revenueEur: revenueInRange(r.start, r.end) };
  });
}

export function revenueAllTime() {
  let sum = 0;
  (S.contacts || []).forEach(function(c) {
    if (c.status !== 'closed') return;
    const v = parseFloat(c.deal_value_eur);
    sum += isNaN(v) ? 1800 : v;
  });
  return sum;
}

export function rateValueSeries(grain, key, count) {
  return rateSeries(grain, count).map(function(d) {
    return { label: d.label, value: d[key] || 0 };
  });
}

export function settingRateMonthlySeries(months) {
  return rateValueSeries('month', 'settingRatePer100', months);
}

export function closingRateMonthlySeries(months) {
  return rateValueSeries('month', 'closingRatePer100', months);
}

export function renderSingleLineChart(container, series, opts) {
  if (!container || !series.length) return;
  const color = (opts && opts.color) || '#1A7A40';
  const label = (opts && opts.label) || '';
  const dashed = !!(opts && opts.dashed);
  renderMultiLineChart(container, series, [{ key: 'value', label: label, color: color, dashed: dashed }]);
}

export function linkedInDmWeeklySeries(weeks) {
  return weeklySeries(weeks, function(start, end) {
    return { dms: countLinkedInDmsInRange(start, end) };
  });
}

export function contentLiveWeeklyByPlatform(items, weeks) {
  const ranges = weeklyRanges(weeks);
  const out = { youtube: [], instagram: [], linkedin: [] };
  CONTENT_PLATFORMS.forEach(function(plat) {
    out[plat] = ranges.map(function(r) {
      return {
        label: r.label,
        count: countContentLiveInRange(items, r.start, r.end, plat),
      };
    });
  });
  return out;
}

/** Aktuelle Pipeline: positive Status im CRM (Set Appointment + Closed) */
export function positivePipelineCounts() {
  const contacts = S.contacts || [];
  const setAppointment = contacts.filter(function(c) { return c.status === 'set_appointment'; }).length;
  const closed = contacts.filter(function(c) { return c.status === 'closed'; }).length;
  return { setAppointment, closed, total: setAppointment + closed };
}

export function computeFunnel(period) {
  const { start, end } = periodRange(period);
  const dials = countTouchesInRange(start, end);
  const demosSet = countDemosInRange(start, end);
  const won = countWonInRange(start, end);
  const settingRatePer100 = dials > 0 ? Math.round((demosSet / dials) * 1000) / 10 : 0;
  const closingPer100 = closingRatePer100(dials, won);
  const closingDenom = demosSet + won;
  const closingRatePct = closingDenom > 0 ? Math.round((won / closingDenom) * 1000) / 10 : 0;
  const revenueEur = revenueInRange(start, end);
  const stages = funnelStages();
  return {
    dials, demosSet, won, settingRatePer100, closingRatePer100: closingPer100, closingRatePct, revenueEur,
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

export function renderMultiLineChart(container, series, lines) {
  if (!container || !series.length || !lines || !lines.length) return;
  const maxY = Math.max.apply(null, series.reduce(function(arr, d) {
    lines.forEach(function(ln) { arr.push(d[ln.key] || 0); });
    return arr;
  }, []).concat([1]));
  const w = 100;
  const h = 100;
  const pad = 8;
  function pts(key) {
    return series.map(function(d, i) {
      const x = pad + (i / Math.max(series.length - 1, 1)) * (w - pad * 2);
      const y = h - pad - (((d[key] || 0) / maxY) * (h - pad * 2));
      return x.toFixed(1) + ',' + y.toFixed(1);
    }).join(' ');
  }
  const gridLines = [0.25, 0.5, 0.75].map(function(frac) {
    const y = (h - pad) - frac * (h - pad * 2);
    return '<line x1="' + pad + '" y1="' + y.toFixed(1) + '" x2="' + (w - pad) + '" y2="' + y.toFixed(1) + '" class="chart-grid-line"/>';
  }).join('');
  const polylines = lines.map(function(ln) {
    const dash = ln.dashed ? ' stroke-dasharray="4 3"' : '';
    const cls = ln.cls ? ' class="' + ln.cls + '"' : '';
    return '<polyline points="' + pts(ln.key) + '" fill="none" stroke="' + ln.color + '" stroke-width="2" vector-effect="non-scaling-stroke"' + dash + cls + '/>';
  }).join('');
  const legend = lines.map(function(ln) {
    const swatchCls = ln.cls ? ' chart-line-swatch ' + ln.cls : ' chart-line-swatch';
    const swatchStyle = ln.dashed && !ln.cls ? ' style="background:transparent;border-bottom:2px dashed ' + ln.color + '"' : (ln.cls ? '' : ' style="background:' + ln.color + '"');
    return '<span class="chart-line-legend-item"><i class="' + swatchCls.trim() + '"' + swatchStyle + '></i> ' + esc(ln.label) + '</span>';
  }).join('');
  const labels = series.map(function(d) {
    return '<span class="chart-line-lbl">' + esc(d.label) + '</span>';
  }).join('');
  container.innerHTML =
    '<div class="chart-line-legend">' + legend + '</div>' +
    '<svg class="chart-svg chart-line-svg" viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="xMidYMid meet">' +
      gridLines + polylines +
    '</svg>' +
    '<div class="chart-line-labels">' + labels + '</div>';
}

export function renderDualLineChart(container, series) {
  renderMultiLineChart(container, series, [
    { key: 'settingRatePer100', label: 'Setting /100', color: '#1A7A40', cls: 'chart-line-setting' },
    { key: 'closingRatePer100', label: 'Closing /100', color: '#0A5C24', dashed: true, cls: 'chart-line-closing' },
  ]);
}

export function renderVolumeChart(container, series, opts) {
  if (!container || !series.length) return;
  const key = (opts && opts.key) || 'touches';
  const cls = (opts && opts.cls) || '';
  const barMax = (opts && opts.barMax) || 72;
  const max = Math.max.apply(null, series.map(function(d) { return d[key]; }).concat([1]));
  container.innerHTML = '<div class="chart-bar">' + series.map(function(d) {
    const val = d[key] || 0;
    const height = Math.round((val / max) * barMax);
    return '<div class="chart-bar-col">' +
      '<div class="chart-bar-fill' + (cls ? ' ' + cls : '') + '" style="height:' + height + 'px" title="' + val + '"></div>' +
      '<span class="chart-bar-label">' + esc(d.label) + '</span></div>';
  }).join('') + '</div>';
}

export function renderPlatformLineChart(container, series, color) {
  if (!container || !series.length) return;
  const data = series.map(function(d) { return { label: d.label, count: d.count }; });
  renderMultiLineChart(container, data, [{ key: 'count', label: '', color: color }]);
  const leg = container.querySelector('.chart-line-legend');
  if (leg) leg.hidden = true;
}

export function renderPieChart(container, data) {
  if (!container) return;
  const slices = (data && data.slices) || [];
  if (!slices.length) {
    container.innerHTML = '<p class="dash-empty">Keine Outreach-Daten im Zeitraum.</p>';
    return;
  }
  const total = data.total || slices.reduce(function(n, s) { return n + s.value; }, 0);
  let acc = 0;
  const paths = slices.map(function(s) {
    const pct = s.value / total;
    const start = acc * 2 * Math.PI - Math.PI / 2;
    acc += pct;
    const end = acc * 2 * Math.PI - Math.PI / 2;
    if (pct >= 0.999) return '<circle cx="50" cy="50" r="40" fill="' + s.color + '"/>';
    const large = pct > 0.5 ? 1 : 0;
    const x1 = 50 + 40 * Math.cos(start);
    const y1 = 50 + 40 * Math.sin(start);
    const x2 = 50 + 40 * Math.cos(end);
    const y2 = 50 + 40 * Math.sin(end);
    return '<path d="M50,50 L' + x1 + ',' + y1 + ' A40,40 0 ' + large + ',1 ' + x2 + ',' + y2 + ' Z" fill="' + s.color + '"/>';
  }).join('');
  const legend = slices.map(function(s) {
    const pct = total > 0 ? Math.round((s.value / total) * 1000) / 10 : 0;
    return '<div class="pie-legend-row"><span class="pie-swatch" style="background:' + s.color + '"></span>' +
      esc(s.label) + ' <strong>' + s.value + '</strong> (' + pct + '%)</div>';
  }).join('');
  container.innerHTML =
    '<div class="pie-wrap">' +
      '<svg class="pie-svg" viewBox="0 0 100 100">' + paths + '</svg>' +
      '<div class="pie-legend">' + legend + '</div>' +
    '</div>';
}

export function renderComboChart(container, series) {
  if (!container || !series.length) return;
  const maxTouches = Math.max.apply(null, series.map(function(d) { return d.touches; }).concat([1]));
  const maxRate = Math.max.apply(null, series.map(function(d) { return d.settingRatePer100; }).concat([1]));
  const cols = series.map(function(d) {
    const h = Math.round((d.touches / maxTouches) * 88);
    const rateY = Math.round(88 - (d.settingRatePer100 / maxRate) * 72);
    return '<div class="chart-combo-col" title="' + d.touches + ' Touches · ' + d.settingRatePer100 + '/100">' +
      '<div class="chart-combo-bar-wrap">' +
        '<div class="chart-combo-bar" style="height:' + h + 'px"></div>' +
        '<span class="chart-combo-rate-dot" style="bottom:' + rateY + 'px" data-rate="' + d.settingRatePer100 + '"></span>' +
      '</div>' +
      '<span class="chart-combo-label">' + d.label + '</span>' +
    '</div>';
  }).join('');
  const points = series.map(function(d, i) {
    const x = ((i + 0.5) / series.length) * 100;
    const y = 100 - (d.settingRatePer100 / maxRate) * 85;
    return x.toFixed(1) + ',' + y.toFixed(1);
  }).join(' ');
  container.innerHTML =
    '<div class="chart-combo-legend">' +
      '<span class="chart-combo-legend-item"><i class="chart-combo-legend-bar"></i> Touches</span>' +
      '<span class="chart-combo-legend-item"><i class="chart-combo-legend-line"></i> Setting Rate /100</span>' +
    '</div>' +
    '<div class="chart-combo">' + cols + '</div>' +
    '<svg class="chart-combo-svg" viewBox="0 0 100 100" preserveAspectRatio="none">' +
      '<polyline class="chart-combo-line" points="' + points + '"/></svg>';
}

export function renderRevenueChart(container, series) {
  if (!container || !series.length) return;
  const max = Math.max.apply(null, series.map(function(d) { return d.revenueEur; }).concat([1]));
  container.innerHTML = '<div class="chart-bar">' + series.map(function(d) {
    const h = Math.round((d.revenueEur / max) * 72);
    const label = d.label || '';
    return '<div class="chart-bar-col">' +
      '<div class="chart-bar-fill chart-bar-fill--revenue" style="height:' + h + 'px" title="' + d.revenueEur + ' €"></div>' +
      '<span class="chart-bar-label">' + label + '</span></div>';
  }).join('') + '</div>';
}

export function renderMiniCharts(container, platformSeries, labels) {
  if (!container) return;
  const plats = ['youtube', 'instagram', 'linkedin'];
  container.innerHTML = '<div class="chart-mini-row">' + plats.map(function(plat) {
    const series = platformSeries[plat] || [];
    const max = Math.max.apply(null, series.map(function(d) { return d.count; }).concat([1]));
    const bars = series.map(function(d) {
      const h = Math.round((d.count / max) * 56);
      return '<div class="chart-mini-col">' +
        '<div class="chart-mini-bar" style="height:' + h + 'px" title="' + d.count + '"></div>' +
        '<span class="chart-mini-lbl">' + d.label + '</span></div>';
    }).join('');
    return '<div class="chart-mini-card">' +
      '<h4 class="chart-mini-title">' + (labels[plat] || plat) + '</h4>' +
      '<div class="chart-mini">' + bars + '</div></div>';
  }).join('') + '</div>';
}

export function renderDmChart(container, series) {
  if (!container || !series.length) return;
  const max = Math.max.apply(null, series.map(function(d) { return d.dms; }).concat([1]));
  container.innerHTML = '<div class="chart-bar">' + series.map(function(d) {
    const h = Math.round((d.dms / max) * 72);
    return '<div class="chart-bar-col">' +
      '<div class="chart-bar-fill chart-bar-fill--linkedin" style="height:' + h + 'px" title="' + d.dms + ' DMs"></div>' +
      '<span class="chart-bar-label">' + d.label + '</span></div>';
  }).join('') + '</div>';
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
    step('Set Appointment', s.demos, 'chart-funnel-bar--positive') +
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
