import { S } from './state.js';
import { markDirty, persist, pushDirty } from './sync.js';
import { esc, toast } from './ui.js';
import { td } from './utils.js';

const WH_BASE  = 'https://n8n.ritz-ai.solutions/webhook/';
const WH_TOKEN = 'ESyfcQbQHy5sFFJBRsmPJSPIs1-87jQw7zCGHetsGpc';
const WH = { salesrep: WH_BASE + 'wf9-salesrep' };
const HISTORY_KEY = 'rais_salesrep_history';
const HISTORY_MAX = 10;

function whFetch(url, opts) {
  opts = opts || {};
  opts.headers = Object.assign({ 'Content-Type': 'application/json', 'X-RAIS-Token': WH_TOKEN }, opts.headers || {});
  return fetch(url, opts);
}

function getContact(id) {
  return S.contacts.find(function(x) { return x.id === id; });
}

function normalizeWebsite(url) {
  const u = (url || '').trim();
  if (!u) return '';
  if (/^https?:\/\//i.test(u)) return u;
  return 'https://' + u;
}

function readForm(prefix) {
  const p = prefix || 'sr';
  return {
    firma: (document.getElementById(p + 'Firma')?.value || '').trim(),
    website: normalizeWebsite(document.getElementById(p + 'Website')?.value || ''),
    stadt: (document.getElementById(p + 'Stadt')?.value || '').trim(),
    gewerk: (document.getElementById(p + 'Gewerk')?.value || '').trim(),
  };
}

function fillForm(prefix, data) {
  const p = prefix || 'sr';
  const elF = document.getElementById(p + 'Firma');
  const elW = document.getElementById(p + 'Website');
  const elS = document.getElementById(p + 'Stadt');
  const elG = document.getElementById(p + 'Gewerk');
  if (elF) elF.value = data.firma || '';
  if (elW) elW.value = data.website || '';
  if (elS) elS.value = data.stadt || '';
  if (elG) elG.value = data.gewerk || '';
}

function reportHtml(report) {
  if (!report) return '';
  const gaps = Array.isArray(report.gaps) ? report.gaps : [];
  const hooks = Array.isArray(report.hooks) ? report.hooks : [];
  const webOk = report.website_ok === true;
  const webLabel = report.website
    ? (webOk ? 'Erreichbar' : 'Problem / unklar') + ' (' + esc(report.http_status || '—') + ')'
    : '—';
  let html = '<div class="salesrep-report">';
  html += '<div class="salesrep-report-row"><span class="salesrep-lbl">Website</span><span>' + esc(report.website || '—') + ' · ' + webLabel + '</span></div>';
  html += '<div class="salesrep-report-row"><span class="salesrep-lbl">Kontakt</span><span>' + esc(report.kontakt || '—') + '</span></div>';
  html += '<div class="salesrep-report-row"><span class="salesrep-lbl">Telefon</span><span>' + esc(report.telefon || '—') + '</span></div>';
  html += '<div class="salesrep-report-row"><span class="salesrep-lbl">E-Mail</span><span>' + esc(report.email || '—') + '</span></div>';
  if (report.summary) {
    html += '<p class="salesrep-summary">' + esc(report.summary).replace(/\n/g, '<br>') + '</p>';
  }
  if (gaps.length) {
    html += '<h4 class="salesrep-sub">Lücken / Ansatzpunkte</h4><ul class="salesrep-gap-list">';
    gaps.forEach(function(g) { html += '<li>' + esc(g) + '</li>'; });
    html += '</ul>';
  }
  if (hooks.length) {
    html += '<h4 class="salesrep-sub">Gesprächs-Hooks</h4><ul class="salesrep-gap-list">';
    hooks.forEach(function(h) { html += '<li>' + esc(h) + '</li>'; });
    html += '</ul>';
  }
  if (report.confidence) {
    html += '<p class="salesrep-conf">Vertrauen: ' + esc(report.confidence) + '</p>';
  }
  html += '<p class="salesrep-hint">Öffentliche Quellen — vor dem Anruf plausibel prüfen.</p>';
  html += '</div>';
  return html;
}

function renderApplySection(report, contactId, containerId) {
  const box = document.getElementById(containerId);
  if (!box) return;
  if (!contactId || !report) {
    box.hidden = true;
    box.innerHTML = '';
    return;
  }
  const c = getContact(contactId);
  if (!c) { box.hidden = true; return; }
  box.hidden = false;
  const fields = [
    { key: 'website', label: 'Website', val: report.website, cur: c.website },
    { key: 'kontakt', label: 'Kontakt', val: report.kontakt, cur: c.kontakt },
    { key: 'telefon', label: 'Telefon', val: report.telefon, cur: c.telefon },
    { key: 'email', label: 'E-Mail', val: report.email, cur: c.email },
  ];
  let html = '<h4 class="salesrep-sub">In Kontakt übernehmen</h4>';
  fields.forEach(function(f) {
    const v = (f.val || '').trim();
    if (!v || v === '—' || v === 'NA') return;
    const filled = !!(f.cur || '').trim();
    const checked = !filled ? ' checked' : '';
    const disabled = filled ? ' disabled' : '';
    html += '<label class="salesrep-apply-row"><input type="checkbox" data-field="' + f.key + '"' + checked + disabled + '> ' +
      esc(f.label) + ': ' + esc(v) + (filled ? ' <span class="salesrep-apply-warn">(CRM: ' + esc(f.cur) + ')</span>' : '') + '</label>';
  });
  html += '<label class="salesrep-apply-row"><input type="checkbox" data-field="notiz" checked> Zusammenfassung in Notiz anhängen</label>';
  html += '<button type="button" class="btn bp bsm salesrep-apply-btn">Übernehmen</button>';
  box.innerHTML = html;
  box.querySelector('.salesrep-apply-btn')?.addEventListener('click', function() {
    salesRepApplyToContact(contactId, box);
  });
}

function setLoading(loading, prefix) {
  const loadEl = document.getElementById((prefix || 'sr') + 'Loading');
  const runBtn = document.getElementById((prefix || 'sr') + 'RunBtn');
  if (loadEl) loadEl.hidden = !loading;
  if (runBtn) { runBtn.disabled = loading; runBtn.textContent = loading ? 'Recherchiert…' : 'Recherche starten'; }
}

function pushHistory(entry) {
  try {
    let list = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
    if (!Array.isArray(list)) list = [];
    list.unshift(entry);
    if (list.length > HISTORY_MAX) list = list.slice(0, HISTORY_MAX);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(list));
  } catch (e) { /* ignore */ }
}

function renderHistoryList() {
  const el = document.getElementById('srPageHistory');
  if (!el) return;
  let list = [];
  try { list = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'); } catch (e) { list = []; }
  if (!list.length) {
    el.innerHTML = '<p class="salesrep-empty">Noch keine Recherchen.</p>';
    return;
  }
  el.innerHTML = list.map(function(h, i) {
    return '<button type="button" class="salesrep-hist-item" data-idx="' + i + '">' +
      esc(h.firma || '—') + ' <span class="salesrep-hist-date">' + esc(h.at || '') + '</span></button>';
  }).join('');
  el.querySelectorAll('.salesrep-hist-item').forEach(function(btn) {
    btn.addEventListener('click', function() {
      const h = list[parseInt(btn.dataset.idx, 10)];
      if (!h) return;
      fillForm('srPage', h);
      const out = document.getElementById('srPageResult');
      if (out && h.report) {
        out.hidden = false;
        out.innerHTML = reportHtml(h.report);
        S.salesrepReport = h.report;
        S.salesrepContactId = null;
        renderApplySection(null, null, 'srPageApply');
      }
    });
  });
}

export function openSalesRepPop(contactId) {
  S.salesrepContactId = contactId || null;
  S.salesrepReport = null;
  const pop = document.getElementById('salesrepPop');
  if (!pop) return;
  const c = contactId ? getContact(contactId) : null;
  fillForm('sr', {
    firma: c?.firma || '',
    website: c?.website || '',
    stadt: c?.stadt || '',
    gewerk: c?.gewerk || '',
  });
  const meta = document.getElementById('srMeta');
  if (meta) meta.textContent = c ? ('Lead: ' + (c.firma || '—')) : 'Freie Recherche';
  const result = document.getElementById('srResult');
  const apply = document.getElementById('srApply');
  if (result) { result.hidden = true; result.innerHTML = ''; }
  if (apply) { apply.hidden = true; apply.innerHTML = ''; }
  setLoading(false, 'sr');
  pop.classList.add('on');
}

export function closeSalesRepPop() {
  const pop = document.getElementById('salesrepPop');
  if (pop) pop.classList.remove('on');
  S.salesrepContactId = null;
  S.salesrepReport = null;
}

export async function salesRepRun(fromPage) {
  const prefix = fromPage ? 'srPage' : 'sr';
  const form = readForm(prefix);
  if (!form.firma) {
    toast('Bitte Firmennamen eingeben.');
    return;
  }
  const contactId = fromPage ? null : S.salesrepContactId;
  const c = contactId ? getContact(contactId) : null;
  const mode = contactId ? 'contact' : 'free';

  setLoading(true, prefix);
  const resultId = fromPage ? 'srPageResult' : 'srResult';
  const applyId = fromPage ? 'srPageApply' : 'srApply';

  try {
    const resp = await whFetch(WH.salesrep, {
      method: 'POST',
      body: JSON.stringify({
        mode: mode,
        contact_id: contactId || '',
        firma: form.firma,
        website: form.website,
        stadt: form.stadt,
        gewerk: form.gewerk,
        notiz: c ? (c.notiz || c.besonderheit || '').trim() : '',
      }),
    });
    const data = await resp.json().catch(function() { return {}; });
    if (!resp.ok || !data.ok) throw new Error(data.error || 'HTTP ' + resp.status);

    S.salesrepReport = data.report;
    const out = document.getElementById(resultId);
    if (out) {
      out.hidden = false;
      out.innerHTML = reportHtml(data.report);
    }
    renderApplySection(data.report, contactId, applyId);

    pushHistory({
      at: new Date().toISOString().slice(0, 16).replace('T', ' '),
      firma: form.firma,
      report: data.report,
    });
    if (fromPage) renderHistoryList();

    toast('Recherche abgeschlossen.');
  } catch (e) {
    toast('Sales Rep Assistant: ' + e.message);
  } finally {
    setLoading(false, prefix);
  }
}

export function salesRepApplyToContact(contactId, applyRoot) {
  const report = S.salesrepReport;
  const c = getContact(contactId);
  if (!c || !report) return;

  const root = applyRoot || document.getElementById('srApply');
  if (!root) return;

  let changed = false;
  root.querySelectorAll('input[type="checkbox"]:checked').forEach(function(cb) {
    const field = cb.dataset.field;
    const val = (report[field] || '').trim();
    if (field === 'notiz') {
      const block = '\n\n--- Sales Rep Assistant (' + td() + ') ---\n' + (report.summary || '');
      const gaps = Array.isArray(report.gaps) ? report.gaps.join('; ') : '';
      const extra = (gaps ? '\nLücken: ' + gaps : '');
      c.notiz = ((c.notiz || c.besonderheit || '').trim() + block + extra).trim();
      c.besonderheit = c.notiz;
      changed = true;
      return;
    }
    if (!val || val === '—' || val === 'NA') return;
    if (!(c[field] || '').trim()) {
      c[field] = val;
      changed = true;
    }
  });

  if (!changed) {
    toast('Nichts übernommen (Felder leer oder nicht ausgewählt).');
    return;
  }

  if (!c.extra || typeof c.extra !== 'object') c.extra = {};
  c.extra.salesrep_last = { at: new Date().toISOString(), report: report };
  markDirty(c);
  persist();
  pushDirty();
  if (typeof window.render === 'function') window.render();
  toast('Kontakt aktualisiert.');
  if (!applyRoot || applyRoot.id === 'srApply') closeSalesRepPop();
}

let _salesrepPageInit = false;

export function initSalesRepPage() {
  const root = document.getElementById('salesrep-page-root');
  if (!root) return;

  if (!_salesrepPageInit) {
    root.innerHTML =
      '<main class="salesrep-page-inner">' +
      '<header class="salesrep-header"><h1 class="salesrep-h1">Sales Rep Assistant</h1>' +
      '<p class="salesrep-sub">Firmenrecherche für Cold Calls — öffentliche Quellen via Gemini.</p></header>' +
      '<div class="salesrep-layout">' +
      '<section class="salesrep-panel">' +
      '<h2 class="salesrep-h2">Neue Recherche</h2>' +
      '<div class="fr"><label for="srPageFirma">Firma *</label><input type="text" id="srPageFirma" class="fs2" style="width:100%"></div>' +
      '<div class="fr"><label for="srPageWebsite">Website</label><input type="text" id="srPageWebsite" class="fs2" style="width:100%" placeholder="https://…"></div>' +
      '<div class="fr2"><div><label for="srPageStadt">Stadt</label><input type="text" id="srPageStadt" class="fs2" style="width:100%"></div>' +
      '<div><label for="srPageGewerk">Gewerk</label><input type="text" id="srPageGewerk" class="fs2" style="width:100%"></div></div>' +
      '<button type="button" class="btn bp" id="srPageRunBtn">Recherche starten</button>' +
      '<div id="srPageLoading" hidden class="salesrep-loading">Sales Rep Assistant recherchiert…</div>' +
      '<div id="srPageResult" class="salesrep-result" hidden></div>' +
      '<div id="srPageApply" class="salesrep-apply" hidden></div>' +
      '</section>' +
      '<section class="salesrep-panel salesrep-panel-hist">' +
      '<h2 class="salesrep-h2">Verlauf</h2>' +
      '<div id="srPageHistory" class="salesrep-history"></div>' +
      '</section></div></main>';

    document.getElementById('srPageRunBtn')?.addEventListener('click', function() {
      salesRepRun(true);
    });
    _salesrepPageInit = true;
  }

  fillForm('srPage', {});
  const _out = document.getElementById('srPageResult');
  if (_out) { _out.hidden = true; _out.innerHTML = ''; }
  const _apply = document.getElementById('srPageApply');
  if (_apply) { _apply.hidden = true; _apply.innerHTML = ''; }
  setLoading(false, 'srPage');
  renderHistoryList();
}

