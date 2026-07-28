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

function endOfDay(d) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
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
const CALL_CONVERSATION_TOUCH_LABELS = [
  'Gatekeeper',
  'Rückruf erbeten',
  'Interessiert',
  'Termin vereinbart',
  'Angebot gesendet',
  'Set Appointment',
  'Closed',
];
const DM_RESPONSE_STATUSES = [
  'connected',
  'follow_up_1',
  'follow_up_2',
  'termin_gesetzt',
  'kein_interesse',
  'disqualified',
];

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

function dayRangesBetween(start, end) {
  const ranges = [];
  const s = startOfDay(start);
  const e = endOfDay(end);
  for (let d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) {
    const dayStart = new Date(d);
    const dayEnd = endOfDay(d);
    ranges.push({
      start: dayStart,
      end: dayEnd,
      label: dayStart.toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric' }),
    });
  }
  return ranges;
}

function monthRangesBetween(start, end) {
  const ranges = [];
  const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
  const endMonth = new Date(end.getFullYear(), end.getMonth(), 1);
  while (cursor <= endMonth) {
    const monthStart = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const monthEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0, 23, 59, 59, 999);
    ranges.push({
      start: monthStart,
      end: monthEnd,
      label: monthStart.toLocaleDateString('de-DE', { month: 'short', year: '2-digit' }),
    });
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return ranges;
}

export function buildPerformanceRanges(period, options) {
  options = options || {};
  const now = options.now ? new Date(options.now) : new Date();
  if (period === 'week') {
    const start = weekStart(now);
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    return dayRangesBetween(start, end);
  }
  if (period === 'month') {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return dayRangesBetween(start, end);
  }
  if (period === 'year') {
    return monthRangesBetween(new Date(2026, 0, 1), new Date(2026, 11, 31));
  }
  if (period === 'alltime') {
    const start = options.allTimeStart ? new Date(options.allTimeStart) : new Date(now.getFullYear(), now.getMonth(), 1);
    const normalizedStart = isNaN(start.getTime()) ? new Date(now.getFullYear(), now.getMonth(), 1) : start;
    return monthRangesBetween(normalizedStart, now);
  }
  return monthlyRanges(GRAIN_POINTS.month);
}

export function rangesForGrain(grain, count) {
  if (grain === 'day') return dailyRanges(count || GRAIN_POINTS.day);
  if (grain === 'month') return monthlyRanges(count || GRAIN_POINTS.month);
  return weeklyRanges(count || GRAIN_POINTS.week);
}

export function closingRatePer100(touches, won) {
  return touches > 0 ? Math.round((won / touches) * 1000) / 10 : 0;
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

function countCallConversationsInRange(start, end) {
  const labels = CALL_CONVERSATION_TOUCH_LABELS.map(function(label) { return label.toLowerCase(); });
  let n = 0;
  (S.contacts || []).forEach(function(c) {
    (c.touches || []).forEach(function(t) {
      const d = parseDate(t.datum);
      const st = String(t.status || '').toLowerCase();
      if (!d || !inRange(d, start, end)) return;
      if (st === String(LINKEDIN_DM_LABEL).toLowerCase()) return;
      if (labels.indexOf(st) >= 0) n++;
    });
  });
  return n;
}

function countDmEventsInRange(dmEvents, start, end, predicate) {
  let n = 0;
  (dmEvents || []).forEach(function(ev) {
    const d = parseDate(ev.changed_at);
    if (!d || !inRange(d, start, end)) return;
    if (!predicate || predicate(ev)) n++;
  });
  return n;
}

function countCallEventsInRange(callEvents, start, end, predicate) {
  let n = 0;
  (callEvents || []).forEach(function(ev) {
    const d = parseDate(ev.occurred_at);
    if (!d || !inRange(d, start, end)) return;
    if (!predicate || predicate(ev)) n++;
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

export function channelPerformanceSeries(grain, count, data, opts) {
  opts = opts || {};
  const callEvents = (data && Array.isArray(data.callEvents)) ? data.callEvents : [];
  const dmEvents = (data && Array.isArray(data.dmEvents)) ? data.dmEvents : [];
  const dmLeads = (data && Array.isArray(data.dmLeads)) ? data.dmLeads : [];
  const dmClosedContacts = (data && Array.isArray(data.dmClosedContacts)) ? data.dmClosedContacts : [];
  const dmLinkedContactIds = new Set(
    dmLeads
      .map(function(lead) { return lead.crm_contact_id; })
      .filter(function(id) { return !!id; })
      .map(function(id) { return String(id); }),
  );
  const dmResponseStatuses = new Set(DM_RESPONSE_STATUSES);

  const ranges = Array.isArray(opts.ranges) && opts.ranges.length
    ? opts.ranges
    : rangesForGrain(grain, count);
  return ranges.map(function(r) {
    const useCallEvents = callEvents.length > 0;
    const callTouches = useCallEvents
      ? countCallEventsInRange(callEvents, r.start, r.end, function(ev) { return ev.event_type === 'touch_logged'; })
      : countCallTouchesInRange(r.start, r.end);
    const callConversations = useCallEvents
      ? countCallEventsInRange(callEvents, r.start, r.end, function(ev) {
        const bucket = String(ev.result_bucket || '').toLowerCase();
        return bucket === 'conversation' || bucket === 'appointment' || bucket === 'close';
      })
      : countCallConversationsInRange(r.start, r.end);
    const callAppointments = useCallEvents
      ? countCallEventsInRange(callEvents, r.start, r.end, function(ev) { return ev.event_type === 'appointment_set'; })
      : countDemosInRange(r.start, r.end);
    const callCloses = useCallEvents
      ? countCallEventsInRange(callEvents, r.start, r.end, function(ev) { return ev.event_type === 'close_won'; })
      : countWonInRange(r.start, r.end);

    const dmTouches = countDmEventsInRange(dmEvents, r.start, r.end);
    const dmConversations = countDmEventsInRange(dmEvents, r.start, r.end, function(ev) {
      return dmResponseStatuses.has(String(ev.status_to || '').toLowerCase());
    });
    const dmAppointments = countDmEventsInRange(dmEvents, r.start, r.end, function(ev) {
      return String(ev.status_to || '').toLowerCase() === 'termin_gesetzt';
    });
    const dmCloses = dmClosedContacts.filter(function(c) {
      if (!dmLinkedContactIds.has(String(c.id || ''))) return false;
      const d = parseDate(c.status_changed_at);
      return inRange(d, r.start, r.end);
    }).length;

    return {
      label: r.label,
      callTouches,
      dmTouches,
      callConversations,
      dmConversations,
      callAppointments,
      dmAppointments,
      callCloses,
      dmCloses,
    };
  });
}

export function summarizeChannelSeries(series) {
  return (series || []).reduce(function(acc, row) {
    acc.callTouches += row.callTouches || 0;
    acc.dmTouches += row.dmTouches || 0;
    acc.callConversations += row.callConversations || 0;
    acc.dmConversations += row.dmConversations || 0;
    acc.callAppointments += row.callAppointments || 0;
    acc.dmAppointments += row.dmAppointments || 0;
    acc.callCloses += row.callCloses || 0;
    acc.dmCloses += row.dmCloses || 0;
    return acc;
  }, {
    callTouches: 0,
    dmTouches: 0,
    callConversations: 0,
    dmConversations: 0,
    callAppointments: 0,
    dmAppointments: 0,
    callCloses: 0,
    dmCloses: 0,
  });
}

export function renderMultiLineChart(container, series, lines, opts) {
  if (!container || !series.length || !lines || !lines.length) return;
  opts = opts || {};
  const maxY = Math.max.apply(null, series.reduce(function(arr, d) {
    lines.forEach(function(ln) { arr.push(d[ln.key] || 0); });
    return arr;
  }, []).concat([1]));
  const w = 100;
  const h = 100;
  const pad = 8;
  const baseline = (h - pad).toFixed(1);
  function points(key) {
    return series.map(function(d, i) {
      const x = pad + (i / Math.max(series.length - 1, 1)) * (w - pad * 2);
      const y = h - pad - (((d[key] || 0) / maxY) * (h - pad * 2));
      return { x: x.toFixed(1), y: y.toFixed(1) };
    });
  }
  function ptsAttr(list) {
    return list.map(function(p) { return p.x + ',' + p.y; }).join(' ');
  }
  const gridLines = [0.25, 0.5, 0.75].map(function(frac) {
    const y = (h - pad) - frac * (h - pad * 2);
    return '<line x1="' + pad + '" y1="' + y.toFixed(1) + '" x2="' + (w - pad) + '" y2="' + y.toFixed(1) + '" class="chart-grid-line"/>';
  }).join('');
  const areaPaths = lines.map(function(ln) {
    if (!ln.area) return '';
    const pts = points(ln.key);
    if (!pts.length) return '';
    const first = pts[0];
    const last = pts[pts.length - 1];
    const area = first.x + ',' + baseline + ' ' + ptsAttr(pts) + ' ' + last.x + ',' + baseline;
    const areaColor = ln.areaColor || ln.color;
    const areaOpacity = ln.areaOpacity != null ? ln.areaOpacity : 0.14;
    return '<polygon points="' + area + '" fill="' + areaColor + '" fill-opacity="' + areaOpacity + '" class="chart-area-fill"/>';
  }).join('');
  const polylines = lines.map(function(ln) {
    const dash = ln.dashed ? ' stroke-dasharray="4 3"' : '';
    const cls = ln.cls ? ' class="' + ln.cls + '"' : '';
    return '<polyline points="' + ptsAttr(points(ln.key)) + '" fill="none" stroke="' + ln.color + '" stroke-width="2" vector-effect="non-scaling-stroke"' + dash + cls + '/>';
  }).join('');
  const circles = lines.map(function(ln) {
    if (ln.points === false) return '';
    const autoPoints = ln.points == null || ln.points === 'auto';
    const showPoints = ln.points === true ? true : (autoPoints && series.length <= 16);
    if (!showPoints) return '';
    return points(ln.key).map(function(p) {
      return '<circle cx="' + p.x + '" cy="' + p.y + '" r="1.6" fill="' + ln.color + '" class="chart-line-point"/>';
    }).join('');
  }).join('');
  const legend = lines.map(function(ln) {
    const swatchCls = ln.cls ? ' chart-line-swatch ' + ln.cls : ' chart-line-swatch';
    const swatchStyle = ln.dashed && !ln.cls ? ' style="background:transparent;border-bottom:2px dashed ' + ln.color + '"' : (ln.cls ? '' : ' style="background:' + ln.color + '"');
    return '<span class="chart-line-legend-item"><i class="' + swatchCls.trim() + '"' + swatchStyle + '></i> ' + esc(ln.label) + '</span>';
  }).join('');
  const autoLabelStep = series.length > 24 ? Math.ceil(series.length / 10) : 1;
  const labelStep = Math.max(1, Number(opts.labelStep || autoLabelStep));
  const labels = series.map(function(d, i) {
    const show = i === 0 || i === series.length - 1 || i % labelStep === 0;
    const text = show ? esc(d.label) : '&nbsp;';
    return '<span class="chart-line-lbl" title="' + esc(d.label) + '">' + text + '</span>';
  }).join('');
  container.innerHTML =
    '<div class="chart-line-legend">' + legend + '</div>' +
    '<svg class="chart-svg chart-line-svg" viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="xMidYMid meet">' +
      gridLines + areaPaths + polylines + circles +
    '</svg>' +
    '<div class="chart-line-labels">' + labels + '</div>';
}

