import { S } from './state.js';
import { sbGet, sbUpsert } from './supabase.js';
import { td } from './utils.js';
import { countLinkedInDmsInRange, countContentLiveInRange } from './analytics.js';

const ACTIVITY_KEY = '/rest/v1/crm_activity_daily';

function parseDate(s) {
  if (!s) return null;
  const d = new Date(s.length === 10 ? s + 'T12:00:00' : s);
  return isNaN(d.getTime()) ? null : d;
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

function countCallTouchesInRange(start, end) {
  let n = 0;
  (S.contacts || []).forEach(function(c) {
    (c.touches || []).forEach(function(t) {
      const d = parseDate(t.datum);
      if (!d || !inRange(d, start, end)) return;
      if (t.status === 'LinkedIn DM') return;
      n++;
    });
  });
  return n;
}

function countMetaAdsLeadsInRange(start, end) {
  return (S.contacts || []).filter(function(c) {
    if (c.lead_origin !== 'meta_ads') return false;
    const d = c.created ? new Date(c.created) : null;
    return inRange(d, start, end);
  }).length;
}

/** CRM + Manual LinkedIn DMs mit Dedupe pro Tag */
export function mergedLinkedInDmsInRange(start, end, manualRows) {
  const byDay = {};
  function dayKey(d) {
    return d.toISOString().slice(0, 10);
  }
  function eachDay(fn) {
    const cur = new Date(start);
    cur.setHours(0, 0, 0, 0);
    const endDay = new Date(end);
    endDay.setHours(0, 0, 0, 0);
    while (cur <= endDay) {
      fn(new Date(cur));
      cur.setDate(cur.getDate() + 1);
    }
  }
  eachDay(function(day) {
    byDay[dayKey(day)] = { manual: 0, crm: 0 };
  });
  (manualRows || []).forEach(function(r) {
    const d = parseDate(r.activity_date);
    if (!d || !inRange(d, start, end)) return;
    const k = dayKey(d);
    if (byDay[k]) byDay[k].manual = r.linkedin_dm_manual || 0;
  });
  eachDay(function(day) {
    const next = new Date(day);
    next.setDate(next.getDate() + 1);
    const k = dayKey(day);
    if (byDay[k]) byDay[k].crm = countLinkedInDmsInRange(day, new Date(next.getTime() - 1));
  });
  let total = 0;
  Object.keys(byDay).forEach(function(k) {
    const m = byDay[k].manual;
    const c = byDay[k].crm;
    total += m + Math.max(0, c - m);
  });
  return total;
}

export function mergedMetaAdsInRange(start, end, manualRows) {
  let manual = 0;
  (manualRows || []).forEach(function(r) {
    const d = parseDate(r.activity_date);
    if (d && inRange(d, start, end)) manual += r.meta_ads_inbound_manual || 0;
  });
  const crm = countMetaAdsLeadsInRange(start, end);
  return manual + crm;
}

export function buildOutreachMix(start, end, contentItems, manualRows) {
  const calls = countCallTouchesInRange(start, end);
  const linkedin = mergedLinkedInDmsInRange(start, end, manualRows);
  const metaAds = mergedMetaAdsInRange(start, end, manualRows);
  const content = countContentLiveInRange(contentItems, start, end);
  const slices = [
    { key: 'calls', label: 'Call-Touches', value: calls, color: '#EC6A37' },
    { key: 'linkedin', label: 'LinkedIn DMs', value: linkedin, color: '#0A66C2' },
    { key: 'meta_ads', label: 'Meta Ads Inbound', value: metaAds, color: '#833AB4' },
    { key: 'content', label: 'Content Live', value: content, color: '#1A7A40' },
  ].filter(function(s) { return s.value > 0; });
  const total = slices.reduce(function(n, s) { return n + s.value; }, 0);
  return { slices, total };
}

export async function loadActivityDaily(fromDate, toDate) {
  try {
    const from = fromDate || '2020-01-01';
    const to = toDate || td();
    const q = ACTIVITY_KEY +
      '?select=*&activity_date=gte.' + from +
      '&activity_date=lte.' + to +
      '&order=activity_date.asc';
    const rows = await sbGet(q);
    return rows || [];
  } catch (_) {
    return [];
  }
}

export async function fetchActivitySnapshot(days) {
  const n = days || 90;
  const end = new Date();
  const start = new Date(end);
  start.setDate(start.getDate() - (n - 1));
  return loadActivityDaily(start.toISOString().slice(0, 10), end.toISOString().slice(0, 10));
}

export async function upsertActivityDaily(date, patch) {
  const row = {
    activity_date: date || td(),
    linkedin_dm_manual: Math.max(0, parseInt(patch.linkedin_dm_manual, 10) || 0),
    meta_ads_inbound_manual: Math.max(0, parseInt(patch.meta_ads_inbound_manual, 10) || 0),
    notiz: patch.notiz || null,
    updated_at: new Date().toISOString(),
  };
  await sbUpsert(ACTIVITY_KEY + '?on_conflict=activity_date', [row]);
  return row;
}

export async function getTodayActivity() {
  const rows = await loadActivityDaily(td(), td());
  return rows[0] || {
    activity_date: td(),
    linkedin_dm_manual: 0,
    meta_ads_inbound_manual: 0,
  };
}
