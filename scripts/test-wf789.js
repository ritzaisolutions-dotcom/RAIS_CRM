/**
 * Live smoke tests for WF7, WF8, WF9 webhooks.
 * Usage: node scripts/test-wf789.js
 *
 * WARNUNG: Ruft n8n-Webhooks DIREKT auf (nicht /api/n8n-proxy).
 * In Produktion sind WF7–WF12 per N8N_PROXY_SECRET geschützt.
 * Setze N8N_PROXY_SECRET in der Umgebung für erfolgreiche Tests.
 */
const WH_BASE = 'https://n8n.ritz-ai.solutions/webhook/';
const PROXY_SECRET = process.env.N8N_PROXY_SECRET || '';

const results = [];

async function call(name, url, body, opts) {
  opts = opts || {};
  const headers = Object.assign({ 'Content-Type': 'application/json' }, opts.headers || {});
  if (PROXY_SECRET) headers['X-CRM-Proxy-Secret'] = PROXY_SECRET;
  const timeout = opts.timeoutMs || 90000;
  const ctrl = new AbortController();
  const timer = setTimeout(function() { ctrl.abort(); }, timeout);
  const t0 = Date.now();
  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    const text = await resp.text();
    let data = null;
    if (text.trim()) {
      try { data = JSON.parse(text); } catch (e) { data = { _raw: text.slice(0, 500) }; }
    }
    return {
      name: name,
      status: resp.status,
      ms: Date.now() - t0,
      data: data,
      empty: !text.trim(),
      textLen: text.length,
    };
  } catch (e) {
    return {
      name: name,
      status: 0,
      ms: Date.now() - t0,
      error: e.name === 'AbortError' ? 'Timeout nach ' + timeout + 'ms' : e.message,
    };
  } finally {
    clearTimeout(timer);
  }
}

function verdict(r, checks) {
  const issues = [];
  checks.forEach(function(c) {
    if (!c.ok) issues.push(c.msg);
  });
  return {
    name: r.name,
    status: r.status,
    ms: r.ms,
    pass: issues.length === 0,
    issues: issues,
    sample: r.data ? JSON.stringify(r.data).slice(0, 280) : (r.empty ? '(leerer Body)' : r.error || ''),
  };
}

async function main() {
  console.log('Testing WF7 / WF8 / WF9 @ ' + WH_BASE + '\n');

  const wf7preview = await call('WF7 preview', WH_BASE + 'wf7-compose', {
    contact_id: 'test-contact',
    anlass: 'nach_call',
    notiz: 'Smoke-Test',
    einwand: '',
    firma: 'Test Fliesen GmbH',
    kontakt: 'Max Mustermann',
    email: 'test@example.com',
    website: 'https://example.com',
    preview_only: true,
  }, { timeoutMs: 30000 });

  results.push(verdict(wf7preview, [
    { ok: wf7preview.status === 200, msg: 'HTTP ' + wf7preview.status + ' (erwartet 200)' },
    { ok: !wf7preview.empty, msg: 'Leerer Response-Body' },
    { ok: wf7preview.data && wf7preview.data.subject, msg: 'Kein subject in Antwort' },
    { ok: wf7preview.data && wf7preview.data.body, msg: 'Kein body in Antwort' },
    { ok: wf7preview.data && (wf7preview.data.ok === true || wf7preview.data.ok === undefined), msg: 'ok !== true' },
  ]));

  const wf7err = await call('WF7 invalid', WH_BASE + 'wf7-compose', { firma: 'X' }, { timeoutMs: 15000 });
  results.push(verdict(wf7err, [
    { ok: wf7err.status === 400, msg: 'HTTP ' + wf7err.status + ' (erwartet 400)' },
    { ok: wf7err.data && wf7err.data.ok === false, msg: 'Kein ok:false' },
    { ok: wf7err.data && wf7err.data.error, msg: 'Keine error-Meldung' },
  ]));

  const wf8invalid = await call('WF8 invalid type', WH_BASE + 'wf8-calendar', {
    type: 'ungueltig', start: '2026-06-15T10:00:00+02:00', duration_minutes: 15, firma: 'Test',
  }, { timeoutMs: 15000 });
  results.push(verdict(wf8invalid, [
    { ok: wf8invalid.status === 400, msg: 'HTTP ' + wf8invalid.status + ' (erwartet 400)' },
    { ok: wf8invalid.data && wf8invalid.data.error, msg: 'Keine error-Meldung' },
  ]));

  const wf8demo = await call('WF8 demo create', WH_BASE + 'wf8-calendar', {
    type: 'demo',
    start: '2026-06-15T10:00:00+02:00',
    duration_minutes: 15,
    contact_id: 'smoke-test',
    firma: '[SMOKE TEST CRM] WF8 — bitte löschen',
    kontakt: 'Test',
    email: 'test@example.com',
    telefon: '+490000',
    website: 'https://example.com',
    notiz: 'Automatischer Smoke-Test scripts/test-wf789.js',
  }, { timeoutMs: 45000 });
  results.push(verdict(wf8demo, [
    { ok: wf8demo.status === 200, msg: 'HTTP ' + wf8demo.status + ' (erwartet 200)' },
    { ok: !wf8demo.empty, msg: 'Leerer Response-Body (Google Calendar Credentials?)' },
    { ok: wf8demo.data && wf8demo.data.ok === true, msg: 'ok !== true' },
    { ok: wf8demo.data && wf8demo.data.event_id, msg: 'Kein event_id' },
  ]));

  const wf9invalid = await call('WF9 missing firma', WH_BASE + 'wf9-salesrep', {
    mode: 'free', firma: '',
  }, { timeoutMs: 15000 });
  results.push(verdict(wf9invalid, [
    { ok: wf9invalid.status === 400, msg: 'HTTP ' + wf9invalid.status + ' (erwartet 400)' },
    { ok: wf9invalid.data && wf9invalid.data.error, msg: 'Keine error-Meldung' },
  ]));

  const wf9research = await call('WF9 research', WH_BASE + 'wf9-salesrep', {
    mode: 'free',
    firma: 'Elektro Lenz und Mildenberger GmbH',
    website: '',
    stadt: '',
    gewerk: 'Elektro',
    notiz: '',
  }, { timeoutMs: 120000 });
  results.push(verdict(wf9research, [
    { ok: wf9research.status === 200, msg: 'HTTP ' + wf9research.status },
    { ok: !wf9research.empty, msg: 'Leerer Response-Body (Gemini-Node bricht ab — WF9 in n8n prüfen)' },
    { ok: wf9research.data && wf9research.data.ok === true, msg: 'ok !== true' },
    { ok: wf9research.data && wf9research.data.report && wf9research.data.report.summary, msg: 'Kein report.summary' },
  ]));

  let passed = 0;
  results.forEach(function(r) {
    const mark = r.pass ? 'PASS' : 'FAIL';
    if (r.pass) passed++;
    console.log('[' + mark + '] ' + r.name + ' — HTTP ' + r.status + ' (' + r.ms + 'ms)');
    if (!r.pass) r.issues.forEach(function(i) { console.log('       ✗ ' + i); });
    if (r.sample) console.log('       → ' + r.sample);
    console.log('');
  });

  console.log('Ergebnis: ' + passed + '/' + results.length + ' Tests bestanden');
  process.exit(passed === results.length ? 0 : 1);
}

main().catch(function(e) {
  console.error(e);
  process.exit(2);
});
