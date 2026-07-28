import { CALL_EVENTS_KEY_SB } from './state.js';
import { sbUpsert } from './supabase.js';
import { isKeinAnschlussStatus } from './utils.js';

function toIsoFromDateStr(dateStr) {
  if (!dateStr) return new Date().toISOString();
  if (dateStr.length === 10) return dateStr + 'T12:00:00.000Z';
  return dateStr;
}

function bucketForEvent(statusTo, touchLabel, explicitBucket) {
  if (explicitBucket) return explicitBucket;
  const st = String(statusTo || '').toLowerCase();
  const tl = String(touchLabel || '').toLowerCase();
  if (st === 'set_appointment') return 'appointment';
  if (st === 'closed') return 'close';
  if (st === 'disqualified' || st === 'mofo' || st === 'loeschen') return 'negative';
  if (tl.indexOf('nicht erreicht') >= 0 || isKeinAnschlussStatus(st)) return 'no_answer';
  if (st === 'gatekeeper' || st === 'callback' || st === 'vernetzt') return 'conversation';
  if (tl.indexOf('gatekeeper') >= 0 || tl.indexOf('rückruf') >= 0 || tl.indexOf('set appointment') >= 0) return 'conversation';
  return 'conversation';
}

async function writeEvents(rows) {
  if (!rows || !rows.length) return;
  try {
    await sbUpsert(CALL_EVENTS_KEY_SB, rows);
  } catch (e) {
    console.warn('crm_call_events write failed:', e.message);
  }
}

export async function recordCallTouchEvent(params) {
  if (!params || !params.contactId) return;
  const row = {
    contact_id: String(params.contactId),
    contact_name: params.contactName || null,
    event_type: 'touch_logged',
    status_from: params.statusFrom || null,
    status_to: params.statusTo || null,
    touch_label: params.touchLabel || null,
    result_bucket: bucketForEvent(params.statusTo, params.touchLabel, params.resultBucket),
    source: params.source || 'manual',
    occurred_at: toIsoFromDateStr(params.occurredAt || null),
  };
  await writeEvents([row]);
}

export async function recordCallStatusEvents(params) {
  if (!params || !params.contactId || !params.toStatus) return;
  const base = {
    contact_id: String(params.contactId),
    contact_name: params.contactName || null,
    status_from: params.fromStatus || null,
    status_to: params.toStatus,
    touch_label: params.touchLabel || null,
    source: params.source || 'manual',
    occurred_at: toIsoFromDateStr(params.occurredAt || null),
  };
  const rows = [{
    event_type: 'status_changed',
    result_bucket: bucketForEvent(params.toStatus, params.touchLabel, params.resultBucket),
  }];
  if (params.toStatus === 'set_appointment') {
    rows.push({ event_type: 'appointment_set', result_bucket: 'appointment' });
  } else if (params.toStatus === 'closed') {
    rows.push({ event_type: 'close_won', result_bucket: 'close' });
  }
  await writeEvents(rows.map(function(ev) { return Object.assign({}, base, ev); }));
}
