import { S } from './state.js';
import { markDirty, persist, pushDirty } from './sync.js';
import { esc, toast } from './ui.js';
import { td, normalizeWebsite } from './utils.js';
import { whFetch } from './wh.js';
const HISTORY_KEY = 'rais_salesrep_history';
const HISTORY_MAX = 10;

const CHAT_WELCOME =
  'Firmendaten unten eingeben und „Recherche starten“ — deine Anfrage und die Recherche-Antwort erscheinen hier im Chat.';

async function parseSalesRepResponse(resp) {
  const text = await resp.text();
  if (!text.trim()) {
    throw new Error('Leere Antwort vom Workflow — WF9 in n8n prüfen (Gemini-Credentials / Workflow aktiv?).');
  }
  let data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    throw new Error('Ungültige Server-Antwort vom Sales Rep Workflow.');
  }
  if (Array.isArray(data)) data = data[0] || {};
  if (data.body && typeof data.body === 'object' && data.ok == null && data.report == null) {
    data = data.body;
  }
  if (!resp.ok) {
    throw new Error(data.error || data.message || ('HTTP ' + resp.status));
  }
  if (data.ok === true && data.report) return data.report;
  if (data.mode === 'ok' && data.report) return data.report;
  if (data.report && typeof data.report === 'object') return data.report;
  throw new Error(data.error || data.message || 'Recherche fehlgeschlagen');
}

function getContact(id) {
  return S.contacts.find(function(x) { return x.id === id; });
}

function chatId(fromPage) {
  return fromPage ? 'srPageChat' : 'srChat';
}

function applyId(fromPage) {
  return fromPage ? 'srPageApply' : 'srApply';
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

function scrollChat(fromPage) {
  const el = document.getElementById(chatId(fromPage));
  if (el) el.scrollTop = el.scrollHeight;
}

function clearChat(fromPage) {
  const el = document.getElementById(chatId(fromPage));
  if (el) el.innerHTML = '';
  const apply = document.getElementById(applyId(fromPage));
  if (apply) { apply.hidden = true; apply.innerHTML = ''; }
}

function appendChatMsg(fromPage, role, innerHtml) {
  const el = document.getElementById(chatId(fromPage));
  if (!el) return;
  const wrap = document.createElement('div');
  wrap.className = 'salesrep-msg salesrep-msg-' + role;
  wrap.innerHTML =
    '<div class="salesrep-msg-avatar" aria-hidden="true">' + (role === 'user' ? 'Du' : 'SR') + '</div>' +
    '<div class="salesrep-msg-body">' + innerHtml + '</div>';
  el.appendChild(wrap);
  scrollChat(fromPage);
}

function userMessageHtml(form) {
  const parts = ['<p class="salesrep-msg-title">' + esc(form.firma) + '</p>'];
  if (form.website) parts.push('<p class="salesrep-msg-line"><span>Website</span> ' + esc(form.website) + '</p>');
  if (form.stadt) parts.push('<p class="salesrep-msg-line"><span>Stadt</span> ' + esc(form.stadt) + '</p>');
  if (form.gewerk) parts.push('<p class="salesrep-msg-line"><span>Gewerk</span> ' + esc(form.gewerk) + '</p>');
  return parts.join('');
}

function showTyping(fromPage, on) {
  const el = document.getElementById(chatId(fromPage));
  if (!el) return;
  let typing = el.querySelector('.salesrep-msg-typing');
  if (on) {
    if (typing) return;
    typing = document.createElement('div');
    typing.className = 'salesrep-msg salesrep-msg-assistant salesrep-msg-typing';
    typing.innerHTML =
      '<div class="salesrep-msg-avatar" aria-hidden="true">SR</div>' +
      '<div class="salesrep-msg-body"><p class="salesrep-typing-text">Sales Rep Assistant recherchiert…</p></div>';
    el.appendChild(typing);
    scrollChat(fromPage);
  } else if (typing) {
    typing.remove();
  }
}

function welcomeChat(fromPage) {
  clearChat(fromPage);
  appendChatMsg(fromPage, 'assistant',
    '<p class="salesrep-msg-welcome">' + esc(CHAT_WELCOME) + '</p>');
}

function loadChatExchange(fromPage, form, report) {
  clearChat(fromPage);
  appendChatMsg(fromPage, 'user', userMessageHtml(form));
  appendChatMsg(fromPage, 'assistant', reportHtml(report));
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
  const sources = Array.isArray(report.sources) ? report.sources : [];
  if (sources.length) {
    html += '<h4 class="salesrep-sub">Quellen</h4><ul class="salesrep-gap-list">';
    sources.forEach(function(s) { html += '<li>' + esc(s) + '</li>'; });
    html += '</ul>';
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
  scrollChat(containerId.indexOf('Page') >= 0);
}

function setLoading(loading, prefix) {
  const fromPage = prefix === 'srPage';
  const runBtn = document.getElementById((prefix || 'sr') + 'RunBtn');
  showTyping(fromPage, loading);
  if (runBtn) {
    runBtn.disabled = loading;
    runBtn.textContent = loading ? 'Sales Rep Assistant recherchiert…' : 'Recherche starten';
  }
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
      const form = {
        firma: h.firma || '',
        website: h.website || '',
        stadt: h.stadt || '',
        gewerk: h.gewerk || '',
      };
      if (h.report) {
        loadChatExchange(true, form, h.report);
        S.salesrepReport = h.report;
        S.salesrepContactId = null;
        renderApplySection(null, null, applyId(true));
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
  welcomeChat(false);
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

  appendChatMsg(fromPage, 'user', userMessageHtml(form));
  setLoading(true, prefix);

  try {
    const resp = await whFetch('wf9-salesrep', {
      mode: mode,
      contact_id: contactId || '',
      firma: form.firma,
      website: form.website,
      stadt: form.stadt,
      gewerk: form.gewerk,
      notiz: c ? (c.notiz || c.besonderheit || '').trim() : '',
    });
    const report = await parseSalesRepResponse(resp);

    S.salesrepReport = report;
    appendChatMsg(fromPage, 'assistant', reportHtml(report));

    renderApplySection(report, contactId, applyId(fromPage));

    pushHistory({
      at: new Date().toISOString().slice(0, 16).replace('T', ' '),
      firma: form.firma,
      website: form.website,
      stadt: form.stadt,
      gewerk: form.gewerk,
      report: report,
    });
    if (fromPage) renderHistoryList();

    toast('Recherche abgeschlossen.');
  } catch (e) {
    appendChatMsg(fromPage, 'assistant',
      '<p class="salesrep-msg-error">Fehler: ' + esc(e.message) + '</p>');
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
    c[field] = val;
    changed = true;
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
