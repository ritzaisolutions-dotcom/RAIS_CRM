import { S, PG, STATUS, TSTAT, TSCLS, LEAD_ORIGIN, LEBENSBEREICHE, PURGE_STATUSES } from './state.js';
import { gid, td, relAge, gewerkKuerzel, gewerkSlug, normalizeWebsite, normalizeGewerk, getCustomGewerke, addCustomGewerk, isColdLead, getSocials, syncLeadTemp, deriveLeadTemp } from './utils.js';
import { sbadge, roib, fdc, esc, ir, toast, originBadge, tempBadge, socialIconsHtml } from './ui.js';
import { markDirty, schedulePersist, schedulePushDirty, isAktionNoetig, pushGewerkCloud } from './sync.js';
import { sbDelete, sbUpsert } from './supabase.js';
import { emailPanelHtml } from './email.js';
import { renderCalls, bumpCall } from './calls.js';
import { touchLastContacted } from './touch.js';
import {
  onStatusChanged, onOutreachRecorded, getActiveSession,
  upsertAktionLead, removeAktionLead, renderAktionQueueBar,
  completeAktionItem, clearCelebrationAktionQueue,
} from './sessions.js';
import { promptAutoClient } from './clients.js';
import { showDemoTodoPopup } from './todopop.js';
import { maybeOfferCalendar } from './calendar.js';

export function isVersicherungsLead(c) {
  if (!c) return false;
  const hay = [
    c.gewerk, c.firma, c.besonderheit, c.notiz,
    c.hauptleistung, c.extra && c.extra.hauptleistung,
  ].filter(Boolean).join(' ').toLowerCase();
  return /versicherung|versicherungsmakler|versicherungsagentur|versicherungsbüro|versicherungsberatung/.test(hay);
}

function webHref(url) {
  const u = normalizeWebsite(url);
  return u ? esc(u) : '';
}

function linkedinCellHtml(socials) {
  socials = socials || {};
  if (!socials.linkedin) return '<span style="color:var(--bd)">—</span>';
  const href = socials.linkedin.startsWith('http') ? socials.linkedin : 'https://linkedin.com/in/' + socials.linkedin.replace(/^\/+/, '');
  return '<a class="soc-icon" href="' + esc(href) + '" target="_blank" rel="noopener" title="LinkedIn" onclick="event.stopPropagation()">in</a>';
}

function touchContactNow(c) {
  if (!c) return;
  c.last_contacted_at = new Date().toISOString();
}

const STATUS_SELECT_GROUPS = [
  { label: '── Default ──', keys: ['neu'] },
  { label: '── Calling ──', keys: ['kein_anschluss', 'gatekeeper', 'callback', 'set_appointment', 'closed'] },
  { label: '── Entfernt ──', keys: ['disqualified', 'mofo'] },
];

const AKTION_SUGGESTIONS = [
  'Rückruf vereinbaren',
  'E-Mail senden',
  'Demo-Termin klären',
  'Unterlagen nachreichen',
  'Angebot erstellen',
  'Website nochmal prüfen',
];

let _aktionPopId = null;
let _listCacheKey = '';
let _listCache = null;
let _renderTimer = null;
let _filtersRev = -1;

function isProspectingActive() {
  const page = document.getElementById('page-prospecting');
  return page && page.classList.contains('active');
}

export function scheduleRender() {
  if (_renderTimer) clearTimeout(_renderTimer);
  _renderTimer = setTimeout(function() {
    _renderTimer = null;
    render();
  }, 300);
}

function invalidateFilterCache() {
  _listCacheKey = '';
  _listCache = null;
}

function lebensbereichOptions() {
  return S.lebensbereiche.length ? S.lebensbereiche : LEBENSBEREICHE;
}

function fillLbSelect(id, selected) {
  const sel = document.getElementById(id);
  if (!sel) return;
  sel.innerHTML = '<option value="">— keiner —</option>' +
    lebensbereichOptions().map(function(l) {
      return '<option value="' + esc(l) + '"' + (l === selected ? ' selected' : '') + '>' + esc(l) + '</option>';
    }).join('');
}

function readSocialsFromForm(prefix) {
  const g = function(id) { const el = document.getElementById(id); return el ? el.value.trim() : ''; };
  return {
    linkedin: g(prefix + 'li') || null,
    instagram: g(prefix + 'ig') || null,
    x: g(prefix + 'x') || null,
    facebook: g(prefix + 'fb') || null,
    whatsapp: g(prefix + 'wa') || null,
  };
}

function statusSelectHtml(c) {
  const cur = c.status || 'neu';
  let html = '<select class="idd st-dd st-' + cur + '" data-id="' + c.id + '" onchange="inlineST(this)" onclick="event.stopPropagation()" title="Status direkt ändern">';
  STATUS_SELECT_GROUPS.forEach(function(g) {
    html += '<optgroup label="' + g.label + '">';
    g.keys.forEach(function(k) {
      if (!STATUS[k]) return;
      html += '<option value="' + k + '"' + (cur === k ? ' selected' : '') + '>' + esc(STATUS[k].label) + '</option>';
    });
    html += '</optgroup>';
  });
  html += '</select>';
  return html;
}

export function getList() {
  const q      = document.getElementById('srch').value.toLowerCase();
  const roi    = document.getElementById('roiF').value;
  const regionF = document.getElementById('regionF').value;
  const gewF    = document.getElementById('gewerkF').value;
  const srt    = document.getElementById('sortS').value;
  const cacheKey = [S.flt, S.dueMode, q, roi, regionF, gewF, srt, JSON.stringify(S.sortStack), S.pinContactId, S.pinListIndex, S.contactsRev].join('\0');
  if (_listCache && cacheKey === _listCacheKey) return _listCache.slice();

  let list = S.contacts.filter(function(c) {
    if (S.flt === 'heute') { const t = td(); return c.followup && c.followup <= t; }
    if (S.flt === 'aktion') return isAktionNoetig(c);
    if (S.flt === 'kalt') return isColdLead(c);
    if (S.flt !== 'all' && c.status !== S.flt) return false;
    if (roi === '0' && c.roi) return false;
    if (roi && roi !== '0' && String(c.roi||'') !== roi) return false;
    if (regionF && (c.region || '') !== regionF) return false;
    if (gewF && (c.gewerk || '') !== gewF) return false;
    if (S.dueMode) { const t = td(); return c.followup && c.followup <= t; }
    if (q) {
      const t1 = (c.touches && c.touches[0]) || {};
      const hay = [c.firma, c.kontakt, c.telefon, c.hauptleistung, t1.status, t1.notiz, c.besonderheit, c.notiz, c.stadt, c.region, c.gewerk].join(' ').toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
  function cmpVal(c, col) {
    if (col === 'roi')     return Number(c.roi) || 0;
    if (col === 'reviews') return parseInt(c.reviews) || 0;
    if (col === 'followup') return c.followup || '9999';
    return String(c[col] || '');
  }
  if (S.sortStack.length) {
    list = list.slice().sort(function(a, b) {
      for (var i = 0; i < S.sortStack.length; i++) {
        var s = S.sortStack[i];
        var numeric = (s.col === 'roi' || s.col === 'reviews');
        var va = cmpVal(a, s.col), vb = cmpVal(b, s.col);
        var r = numeric ? (vb - va) : String(va).localeCompare(String(vb));
        if (r !== 0) return s.dir * r;
      }
      return 0;
    });
  } else {
    list = list.slice().sort(function(a, b) {
      if (srt === 'name') return (a.firma || '').localeCompare(b.firma || '');
      if (srt === 'roi')  return (b.roi || 0) - (a.roi || 0);
      if (srt === 'rev')  return (parseInt(b.reviews) || 0) - (parseInt(a.reviews) || 0);
      if (srt === 'new')     return (b.created || 0) - (a.created || 0);
      if (srt === 'changed') return (b.status_changed_at || '').localeCompare(a.status_changed_at || '');
      const da = a.followup || '9999', db = b.followup || '9999';
      return da.localeCompare(db);
    });
  }
  if (S.pinContactId) {
    const pinId = S.pinContactId;
    let pinIdx = list.findIndex(function(c) { return c.id === pinId; });
    if (pinIdx === -1) {
      const pin = S.contacts.find(function(c) { return c.id === pinId; });
      if (pin) {
        const at = S.pinListIndex != null ? Math.min(S.pinListIndex, list.length) : list.length;
        list.splice(at, 0, pin);
      }
    } else if (S.pinListIndex != null && pinIdx !== S.pinListIndex) {
      const item = list.splice(pinIdx, 1)[0];
      list.splice(Math.min(S.pinListIndex, list.length), 0, item);
    }
  }
  _listCacheKey = cacheKey;
  _listCache = list;
  return list.slice();
}

function clearTablePin() {
  S.pinContactId = null;
  S.pinListIndex = null;
}

function patchFollowupRow(contactId) {
  const c = S.contacts.find(function(x) { return x.id === contactId; });
  const tr = document.querySelector('#tbody tr[data-id="' + contactId + '"]');
  if (!c || !tr) return;
  const t = td();
  tr.classList.toggle('ov', !!(c.followup && c.followup < t));
}

export function setF(f) {
  clearTablePin();
  invalidateFilterCache();
  S.flt = f; S.pg = 1; S.dueMode = false;
  document.querySelectorAll('.stat').forEach(function(el) { el.classList.remove('on'); });
  const map = {all:'s-all', kalt:'s-kalt', neu:'s-neu', kein_anschluss:'s-ka', gatekeeper:'s-gk',
               callback:'s-cb', set_appointment:'s-sa', closed:'s-cl',
               disqualified:'s-dq', mofo:'s-mofo', heute:'s-heute', aktion:'s-aktion'};
  if (map[f]) document.getElementById(map[f]).classList.add('on');
  render();
}

export function filterDue() { clearTablePin(); invalidateFilterCache(); S.dueMode = true; S.pg = 1; render(); }

const OUTREACH_PROTECTED = ['closed', 'set_appointment', 'disqualified', 'mofo'];

export function recordOutreachOnFollowupChange(c, prevFollowup, newFollowup, opts) {
  opts = opts || {};
  if (!c || prevFollowup === newFollowup) return false;
  if (!getActiveSession()) return false;

  if (!c.touches) c.touches = [];
  const touchN = c.touches.length + 1;
  const prevLabel = prevFollowup || '—';
  c.touches.push({
    status: 'Nicht erreicht (2)',
    datum: td(),
    notiz: 'Outreach #' + touchN + ' · FU: ' + prevLabel + ' → ' + (newFollowup || '—'),
  });

  const prevStatus = opts.prevStatus != null ? opts.prevStatus : c.status;
  const statusFromForm = opts.statusFromForm;
  const userChangedStatus = statusFromForm != null && statusFromForm !== prevStatus;

  if (!opts.skipStatusAuto && !userChangedStatus && !OUTREACH_PROTECTED.includes(c.status)) {
    c.status = 'kein_anschluss';
  } else if (statusFromForm != null) {
    c.status = statusFromForm;
  }

  bumpCall();
  syncLeadTemp(c);
  markDirty(c);

  const name = c.firma || c.company_name || '';
  if (userChangedStatus) {
    onStatusChanged(c.id, name, prevStatus, c.status);
  } else if (prevStatus === 'kein_anschluss' && c.status === 'kein_anschluss') {
    onOutreachRecorded(c.id, name, prevStatus, 'kein_anschluss');
  } else if (prevStatus !== c.status) {
    onStatusChanged(c.id, name, prevStatus, c.status);
  } else {
    onOutreachRecorded(c.id, name, prevStatus, c.status);
  }
  return true;
}

function renderMobileCards(slice) {
  const mlist = document.getElementById('mlist');
  if (!mlist) return;
  const t = td();
  if (!slice.length) {
    mlist.innerHTML = '<div class="empty"><div style="font-size:32px;margin-bottom:10px">&#128203;</div><h3>Keine Einträge</h3><p>Filter anpassen oder + Kontakt klicken.</p></div>';
    return;
  }
  mlist.innerHTML = slice.map(function(c) {
    const roi = roib(c.roi);
    const gwBadge = c.gewerk
      ? '<span class="gw-badge gw-' + gewerkSlug(c.gewerk) + '">' + gewerkKuerzel(c.gewerk) + '</span>'
      : '';
    const stadtStr = c.stadt
      ? '<span style="font-family:sans-serif;font-size:12px;color:var(--st)">' + esc(c.stadt) + '</span>'
      : '';
    let fuPill = '';
    if (c.followup) {
      const isOverdue = c.followup < t;
      const isToday   = c.followup === t;
      fuPill = '<span class="mc-fu' + (isOverdue ? ' overdue' : '') + '">' +
        (isOverdue ? '&#9888; ' : isToday ? '&#128222; ' : '') + esc(c.followup) + '</span>';
    }
    const touchCount = (c.touches || []).filter(function(tx) { return tx.status || tx.datum; }).length;
    const touchPill = touchCount > 0 ? '<span class="mc-touch">T' + touchCount + '</span>' : '';
    const originPill = originBadge(c.lead_origin || 'manual');
    const socRow = socialIconsHtml(getSocials(c));
    const note = (c.notiz || c.besonderheit || '').trim();
    const phoneBtn = c.telefon
      ? '<a class="mc-call-btn" href="tel:' + esc(c.telefon) + '" onclick="event.stopPropagation()">&#128222; ' + esc(c.telefon) + '</a>'
      : '';
    return (
      '<div class="mc" data-id="' + c.id + '" onclick="openP(\'' + c.id + '\')" oncontextmenu="showCtxMenuAtEvent(event,\'' + c.id + '\')">' +
        '<div class="mc-top">' +
          '<div class="mc-firma">' + esc(c.firma) +
            (c.website ? ' <a class="mc-globe" href="' + webHref(c.website) + '" target="_blank" rel="noopener" onclick="event.stopPropagation()" title="' + webHref(c.website) + '">&#127760;</a>' : '') +
          '</div>' +
          '<div class="mc-right" onclick="event.stopPropagation()">' +
            '<span class="badge ' + (STATUS[c.status || 'neu'] ? STATUS[c.status || 'neu'].cls : 'b-neu') + ' mc-status-badge" onclick="openQuickStatusSheet(\'' + c.id + '\')">' +
              (STATUS[c.status || 'neu'] ? STATUS[c.status || 'neu'].label : 'Neu') +
            '</span>' +
            roi +
          '</div>' +
        '</div>' +
        '<div class="mc-mid">' + originPill + gwBadge + stadtStr + fuPill + touchPill + (socRow ? ' ' + socRow : '') + '</div>' +
        (note ? '<div class="mc-note">' + esc(note) + '</div>' : '') +
        phoneBtn +
      '</div>'
    );
  }).join('');
}

function populateSelectFilter(id, label, field) {
  const sel = document.getElementById(id);
  if (!sel) return;
  const unique = [...new Set(S.contacts.map(function(c) { return c[field]; }).filter(Boolean))].sort(function(a, b) {
    return String(a).localeCompare(String(b), 'de');
  });
  const current = sel.value;
  sel.innerHTML = '<option value="">' + label + ': Alle</option>' +
    unique.map(function(v) {
      const e = esc(v);
      return '<option value="' + e + '"' + (v === current ? ' selected' : '') + '>' + e + '</option>';
    }).join('');
}

function inlineInput(id, field, value, extra) {
  extra = extra || '';
  return '<input class="idd inline-cell" data-id="' + id + '" data-field="' + field + '" value="' + esc(value || '') + '" onclick="event.stopPropagation()" onchange="inlineField(this)"' + extra + '>';
}

function buildRowHtml(c, pageOffset, i, t) {
  const ovr = (c.followup && c.followup < t) ? ' ov' : '';
  const aktion = isAktionNoetig(c);
  const rowCls = (ovr ? ' ov' : '') + (aktion ? ' tr-aktion' : '');
  const lastT = (c.touches && c.touches.slice().reverse().find(function(tx){ return tx.datum; })) || null;
  const lastTDatum = lastT ? lastT.datum : null;
  const lastTAge = lastTDatum ? Math.floor((new Date(td()) - new Date(lastTDatum)) / 86400000) : null;
  const ageCls = lastTAge === null ? '' : (lastTAge <= 3 ? 'age-fresh' : lastTAge <= 7 ? 'age-warn' : 'age-old');
  const ageStr = lastTDatum ? relAge(lastTDatum) : (c.created ? relAge(new Date(c.created).toISOString().slice(0,10)) : null);
  const webVal = c.website || '';
  return '<tr class="' + rowCls.trim() + '" data-id="' + c.id + '" onclick="openP(\'' + c.id + '\')" oncontextmenu="showCtxMenuAtEvent(event,\'' + c.id + '\')">' +
    '<td class="col-sticky-num col-c-num" style="text-align:right;font-family:sans-serif;font-size:11px;color:#B0A898;padding-right:10px;user-select:none">' + (pageOffset + i + 1) + '</td>' +
    '<td class="fc col-sticky-firma col-c-firma" onclick="event.stopPropagation()"><div class="col-firma-wrap">' +
      inlineInput(c.id, 'firma', c.firma) +
      (c.gewerk ? '<span class="gw-badge gw-' + gewerkSlug(c.gewerk) + '">' + gewerkKuerzel(c.gewerk) + '</span>' : '') +
    '</div></td>' +
    '<td class="col-c-kontakt" onclick="event.stopPropagation()">' + inlineInput(c.id, 'kontakt', c.kontakt) + '</td>' +
    '<td class="col-c-tel" onclick="event.stopPropagation()">' + inlineInput(c.id, 'telefon', c.telefon, ' style="font-family:monospace;font-size:12.5px"') + '</td>' +
    '<td class="col-web col-c-web" onclick="event.stopPropagation()">' + inlineInput(c.id, 'website', webVal, ' placeholder="https://…"') + '</td>' +
    '<td class="st-cell col-c-status" onclick="event.stopPropagation()">' + statusSelectHtml(c) + '</td>' +
    '<td onclick="event.stopPropagation()" class="fu-cell col-c-fu"><input type="date" class="idd-date" data-id="' + c.id + '" value="' + esc(c.followup||'') + '" onfocus="inlineFUFocus(this)" onchange="inlineFU(this)" onblur="inlineFUBlur(this)" title="Follow-up Datum"></td>' +
    (S.colVis.origin ? '<td class="col-c-origin" onclick="event.stopPropagation()">' + originBadge(c.lead_origin || 'manual') + '</td>' : '') +
    (S.colVis.temp ? '<td class="col-c-temp" onclick="event.stopPropagation()">' + tempBadge(c.lead_temp || 'cold') + '</td>' : '') +
    '<td class="notiz-cell col-c-notiz" onclick="event.stopPropagation()">' +
      '<textarea class="nc inline-notiz" data-id="' + c.id + '" rows="1" onblur="saveNotiz(this)" onkeydown="notizKey(event,this)" onclick="event.stopPropagation()">' + esc((c.notiz || '').trim()) + '</textarea>' +
      (ageStr ? '<span class="age-lbl ' + ageCls + '">' + (lastTDatum ? '&#128222; ' : '') + ageStr + '</span>' : '') +
    '</td>' +
    (S.colVis.stadt   ? '<td class="col-c-stadt" onclick="event.stopPropagation()">' + inlineInput(c.id, 'stadt', c.stadt) + '</td>' : '') +
    (S.colVis.region  ? '<td class="col-c-region" onclick="event.stopPropagation()">' + inlineInput(c.id, 'region', c.region) + '</td>' : '') +
    (S.colVis.gewerk  ? '<td class="col-c-gewerk" onclick="event.stopPropagation()">' + inlineInput(c.id, 'gewerk', c.gewerk) + '</td>' : '') +
    '<td class="col-c-linkedin" onclick="event.stopPropagation()" style="text-align:center">' + linkedinCellHtml(getSocials(c)) + '</td>' +
  '</tr>';
}

export function patchContactRow(contactId) {
  const c = S.contacts.find(function(x) { return x.id === contactId; });
  const tr = document.querySelector('#tbody tr[data-id="' + contactId + '"]');
  if (!c || !tr) return;
  const list = getList();
  const idx = list.findIndex(function(x) { return x.id === contactId; });
  if (idx < 0) {
    tr.remove();
    return;
  }
  const pageOffset = (S.pg - 1) * PG;
  const rowIdx = idx - pageOffset;
  if (rowIdx < 0 || rowIdx >= PG) return;
  const t = td();
  const tmp = document.createElement('tbody');
  tmp.innerHTML = buildRowHtml(c, pageOffset, rowIdx, t);
  const newTr = tmp.firstElementChild;
  if (newTr) tr.replaceWith(newTr);
}

function renderStats() {
  const t = td();
  const cnt = { all: S.contacts.length };
  Object.keys(STATUS).forEach(function(k) { cnt[k] = 0; });
  S.contacts.forEach(function(c) {
    const k = c.status || 'neu';
    if (cnt[k] != null) cnt[k]++;
    else cnt.neu = (cnt.neu || 0) + 1;
  });
  const set = function(id, val) { const el = document.getElementById(id); if (el) el.textContent = val; };
  set('c-all', cnt.all);
  set('c-neu', cnt.neu || 0);
  set('c-ka', cnt.kein_anschluss || 0);
  set('c-gk', cnt.gatekeeper || 0);
  set('c-cb', cnt.callback || 0);
  set('c-sa', cnt.set_appointment || 0);
  set('c-cl', cnt.closed || 0);
  set('c-dq', cnt.disqualified || 0);
  set('c-mofo', cnt.mofo || 0);
  set('c-aktion', S.contacts.filter(isAktionNoetig).length);
  set('c-kalt', S.contacts.filter(isColdLead).length);
  const due = S.contacts.filter(function(c) { return c.followup && c.followup <= t; }).length;
  set('c-heute', due);
  const banner = document.getElementById('banner');
  if (banner) banner.classList.toggle('on', due > 0);
  set('bannerC', due);
  renderCalls();
}

function renderThead() {
  function thS(col, lbl, cls) {
    const idx = S.sortStack.findIndex(function(s) { return s.col === col; });
    const act = idx !== -1;
    const dir = act ? S.sortStack[idx].dir : 0;
    const arr = !act ? '&#8645;' : (dir === 1 ? '&#8593;' : '&#8595;');
    const badge = (act && S.sortStack.length > 1) ? '<span class="sort-badge">' + (idx + 1) + '</span>' : '';
    return '<th class="sortable' + (act ? ' sa' : '') + (cls ? ' ' + cls : '') + '" onclick="doSort(\'' + col + '\')">' + lbl + '<span class="si">' + arr + '</span>' + badge + '</th>';
  }
  function thF(lbl, sty, cls) {
    return '<th' + (cls ? ' class="' + cls + '"' : '') + (sty ? ' style="' + sty + '"' : '') + '>' + lbl + '</th>';
  }
  document.getElementById('thead').innerHTML = '<tr>' +
    thF('#', 'text-align:right', 'col-sticky-num col-c-num') +
    thS('firma', 'Firma', 'col-sticky-firma col-c-firma') +
    thF('Person', '', 'col-c-kontakt') + thF('Telefon', '', 'col-c-tel') +
    thF('Website', '', 'col-web col-c-web') +
    thS('status', 'Status', 'col-c-status') + thS('followup', 'Follow-up', 'col-c-fu') +
    (S.colVis.origin ? thF('Herkunft', '', 'col-c-origin') : '') +
    (S.colVis.temp ? thF('Temp', '', 'col-c-temp') : '') +
    thF('Notiz', '', 'col-c-notiz') +
    (S.colVis.stadt   ? thS('stadt', 'Stadt', 'col-c-stadt') : '') +
    (S.colVis.region  ? thS('region', 'Region', 'col-c-region') : '') +
    (S.colVis.gewerk  ? thS('gewerk', 'Gewerk', 'col-c-gewerk') : '') +
    thF('LinkedIn', 'text-align:center', 'col-c-linkedin') +
  '</tr>';
}

export function renderTableBody() {
  const t = td();
  const list = getList();
  const tot  = list.length;
  const pages = Math.max(1, Math.ceil(tot / PG));
  if (S.pg > pages) S.pg = pages;
  const sl = list.slice((S.pg - 1) * PG, S.pg * PG);
  const tbody = document.getElementById('tbody');
  const empty = document.getElementById('empty');
  if (!sl.length) {
    tbody.innerHTML = '';
    empty.style.display = 'block';
  } else {
    empty.style.display = 'none';
    const pageOffset = (S.pg - 1) * PG;
    tbody.innerHTML = sl.map(function(c, i) {
      return buildRowHtml(c, pageOffset, i, t);
    }).join('');
  }
  renderMobileCards(sl);
  document.getElementById('rc').textContent = tot === S.contacts.length
    ? tot + ' Einträge' : tot + ' von ' + S.contacts.length;
  const pb = document.getElementById('pb');
  if (pages <= 1) { pb.innerHTML = ''; return; }
  pb.innerHTML = Array.from({length: pages}, function(_, i) { return i + 1; })
    .map(function(p) { return '<button class="pbb' + (p === S.pg ? ' on' : '') + '" onclick="goPg(' + p + ')">' + p + '</button>'; })
    .join('');
}

export function inlineField(el) {
  const c = S.contacts.find(function(x) { return x.id === el.dataset.id; });
  if (!c) return;
  const field = el.dataset.field;
  let val = el.value.trim();
  if (field === 'website') val = normalizeWebsite(val);
  if (field === 'gewerk') val = normalizeGewerk(val);
  if ((c[field] || '') === (val || '')) return;
  c[field] = val;
  if (field === 'gewerk' && val) pushGewerkCloud(val, c.lebensbereich);
  if (field === 'notiz') c.besonderheit = val;
  markDirty(c);
  schedulePersist();
  schedulePushDirty();
  patchContactRow(c.id);
}

export function render() {
  if (_filtersRev !== S.contactsRev) {
    populateSelectFilter('regionF', 'Region', 'region');
    populateSelectFilter('gewerkF', 'Gewerk', 'gewerk');
    _filtersRev = S.contactsRev;
  }
  renderStats();
  if (!isProspectingActive()) return;
  renderThead();
  renderTableBody();
}

export function goPg(p) { S.pg = p; render(); }

export function openQuickAdd() {
  document.getElementById('qaFirma').value = '';
  document.getElementById('qaTel').value = '';
  document.getElementById('qaGew').value = '';
  document.getElementById('qaLi').value = '';
  document.getElementById('qaIg').value = '';
  document.getElementById('qaOrigin').value = 'manual';
  fillLbSelect('qaLb', '');
  const dl = document.getElementById('qaGewList');
  if (dl) {
    dl.innerHTML = getCustomGewerke().concat(['Fliesenleger','Elektriker','Sanitär','Heizung','Maler','Hausverwaltung','Sonstiges'])
      .filter(function(v, i, a) { return a.indexOf(v) === i; })
      .map(function(g) { return '<option value="' + esc(g) + '">'; }).join('');
  }
  document.getElementById('quickAddModal').classList.add('on');
  document.getElementById('qaFirma').focus();
}

export function closeQuickAdd() { document.getElementById('quickAddModal').classList.remove('on'); }

export function saveQuickAdd() {
  const firma = document.getElementById('qaFirma').value.trim();
  if (!firma) { toast('Firma fehlt.'); return; }
  const gewerk = normalizeGewerk(document.getElementById('qaGew').value);
  const lb = document.getElementById('qaLb').value;
  const socials = {
    linkedin: document.getElementById('qaLi').value.trim() || null,
    instagram: document.getElementById('qaIg').value.trim() || null,
  };
  const d = {
    id: gid(), created: Date.now(), synced_at: null,
    firma: firma,
    telefon: document.getElementById('qaTel').value.trim(),
    gewerk: gewerk,
    lebensbereich: lb || null,
    lead_origin: document.getElementById('qaOrigin').value || 'manual',
    lead_temp: 'cold',
    is_external: document.getElementById('qaOrigin').value === 'external',
    status: 'neu',
    socials: socials,
    touches: [{ status: '', datum: '', notiz: '' }],
  };
  syncLeadTemp(d);
  if (gewerk) pushGewerkCloud(gewerk, lb);
  S.contacts.push(d);
  invalidateFilterCache();
  schedulePersist();
  closeQuickAdd();
  render();
  schedulePushDirty();
  toast('Lead hinzugefügt.');
}

export function openP(id) {
  const c = S.contacts.find(function(x) { return x.id === id; });
  if (!c) return;
  document.getElementById('pFirma').textContent = c.firma;
  var subText = [c.title, c.kontakt].filter(Boolean).join(' · ');
  var globeLink = c.website
    ? ' <a href="' + webHref(c.website) + '" target="_blank" rel="noopener" class="ph-globe" onclick="event.stopPropagation()" title="' + webHref(c.website) + '">&#127760;</a>'
    : '';
  document.getElementById('pSub').innerHTML = (subText ? esc(subText) : '') + globeLink;
  const wsOk = c.webseite_vorhanden === 'TRUE' || c.webseite_vorhanden === true;
  const kalk = c.hat_kalkulator === 'TRUE' || c.hat_kalkulator === true;
  const b = document.getElementById('pBody');

  if (!c.touches) c.touches = [];
  while (c.touches.length < 3) c.touches.push({status:'',datum:'',notiz:''});
  let tHtml = '<div class="sh">Touch-Log</div>';
  c.touches.forEach(function(t, i) {
    const sc = TSCLS[t.status] || 'ki';
    const bdg = t.status ? '<span class="badge b-' + sc + '" style="font-size:10px;padding:1px 6px">' + esc(t.status) + '</span>' : '<span style="font-family:sans-serif;font-size:11px;color:#7B746B;font-style:italic">—</span>';
    const opts = TSTAT.map(function(s) { return '<option value="' + esc(s) + '"' + (t.status===s?' selected':'') + '>' + (s||'— kein Status —') + '</option>'; }).join('');
    tHtml +=
      '<div class="tac">' +
        '<div class="tah" onclick="toggleAcc(this)" id="tah-' + i + '">' +
          '<span style="font-weight:700;font-size:11px;font-family:sans-serif;min-width:22px;color:var(--st)">T' + (i+1) + '</span>' +
          bdg +
          '<span style="font-family:monospace;font-size:11px;color:#7B746B;margin-left:auto;margin-right:6px">' + esc(t.datum||'') + '</span>' +
          '<span class="ta-arrow">&#9660;</span>' +
        '</div>' +
        '<div class="tab" id="tab-' + i + '">' +
          '<div class="fr"><label>Status</label>' +
            '<select class="fs2" onchange="saveTF(\'' + id + '\',' + i + ',\'status\',this.value)">' + opts + '</select>' +
          '</div>' +
          '<div class="fr"><label>Datum</label>' +
            '<input type="date" value="' + esc(t.datum||'') + '" onchange="saveTF(\'' + id + '\',' + i + ',\'datum\',this.value)">' +
          '</div>' +
          '<div class="fr"><label>Notiz / Einwand</label>' +
            '<textarea style="min-height:52px" onblur="saveTF(\'' + id + '\',' + i + ',\'notiz\',this.value)">' + esc(t.notiz||'') + '</textarea>' +
          '</div>' +
        '</div>' +
      '</div>';
  });
  if (c.touches.length < 10) {
    tHtml += '<button class="btn bs bsm" onclick="addTouch(\'' + id + '\')" style="width:100%;margin-top:3px;justify-content:center">+ Touch hinzufügen</button>';
  }

  b.innerHTML =
    (c.telefon ? '<a class="panel-call-btn" href="tel:' + esc(c.telefon) + '">&#128222; ' + esc(c.telefon) + '</a>' : '') +
    '<div class="sh">Kontakt</div>' +
    ir('Telefon', c.telefon ? '<a href="tel:' + esc(c.telefon) + '">' + esc(c.telefon) + '</a>' : '—') +
    ir('E-Mail',  c.email   ? '<a href="mailto:' + esc(c.email) + '">' + esc(c.email) + '</a>' : '—') +
    ir('Website', c.website ? '<a href="' + webHref(c.website) + '" target="_blank" rel="noopener">' + esc(normalizeWebsite(c.website).replace(/^https?:\/\//,'')) + '</a>' : '—') +
    (c.facebook ? ir('Facebook', '<a href="' + webHref(c.facebook) + '" target="_blank" rel="noopener">Profil öffnen</a>') : '') +
    (function() {
      const soc = socialIconsHtml(getSocials(c), true);
      return soc ? '<div class="sh">Social</div>' + soc : '';
    })() +
    (c.lead_origin ? ir('Herkunft', originBadge(c.lead_origin)) : '') +
    (c.lebensbereich ? ir('Lebensbereich', esc(c.lebensbereich)) : '') +
    '<div class="sh">Status</div>' +
    ir('Status',    sbadge(c.status) + (c.status_changed_at ? '<span style="font-size:11px;color:#B0A898;margin-left:7px;font-family:sans-serif">seit ' + relAge(c.status_changed_at) + ' (' + c.status_changed_at + ')</span>' : '')) +
    (isAktionNoetig(c) && c.extra && c.extra.aktion_notiz ? ir('Aktion nötig', esc(c.extra.aktion_notiz)) : '') +
    ir('ROI',       roib(c.roi)) +
    ir('Follow-up', fdc(c.followup)) +
    ((c.stadt||c.region) ? ir('Ort', esc([c.stadt,c.region].filter(Boolean).join(', '))) : '') +
    (c.gewerk ? ir('Gewerk', esc(c.gewerk)) : '') +
    (c.notiz ? '<div class="sh">Interne Notiz</div><div class="panel-notiz-full">' + esc(c.notiz) + '</div>' : '') +
    tHtml +
    (c.besonderheit ? '<div class="sh">Website-Analyse</div><div style="font-family:sans-serif;font-size:13px;background:#F5F2EC;border:1px solid #D9D1C7;border-radius:5px;padding:10px 13px;line-height:1.6;margin-bottom:8px">' + esc(c.besonderheit) + '</div>' : '') +
    '<div class="sh">Website-Info</div>' +
    ir('Alter',    c.webseite_alter || '—') +
    ir('Leistung', c.hauptleistung  || '—') +
    ir('Reviews',  c.reviews        || '—') +
    '<div class="ir"><span class="il">Website</span><div class="iv"><div class="pills">' +
      '<span class="pill ' + (wsOk ? 'py' : 'pn2') + '">' + (wsOk ? '&#10003; vorhanden' : '&#10007; keine Website') + '</span>' +
      '<span class="pill ' + (kalk ? 'py' : 'pn2') + '">' + (kalk ? '&#10003; Kalkulator' : '&#10007; kein Kalkulator') + '</span>' +
    '</div></div></div>' +
    emailPanelHtml(c);

  document.getElementById('pFoot').innerHTML =
    '<div class="pf-status-row">' +
      '<button class="qs-chip qs-chip-ka" onclick="qs(\'' + id + '\',\'kein_anschluss\')">Kein Anschluss</button>' +
      '<button class="qs-chip qs-chip-gk" onclick="qs(\'' + id + '\',\'gatekeeper\')">Gatekeeper</button>' +
      '<button class="qs-chip qs-chip-cb" onclick="qs(\'' + id + '\',\'callback\')">Callback</button>' +
      '<button class="qs-chip qs-chip-sa" onclick="qs(\'' + id + '\',\'set_appointment\')">Set Appointment</button>' +
      '<button class="qs-chip qs-chip-cl" onclick="qs(\'' + id + '\',\'closed\')">Closed</button>' +
      '<button class="qs-chip qs-chip-dq" onclick="qs(\'' + id + '\',\'disqualified\')">Disqualified</button>' +
      '<button class="qs-chip qs-chip-mofo" onclick="qs(\'' + id + '\',\'mofo\')">MoFo</button>' +
    '</div>' +
    '<div class="pf-actions">' +
      '<button class="btn bp bsm" onclick="openE(\'' + id + '\');closeP()">&#9998; Bearbeiten</button>' +
      '<button class="btn bs bsm" onclick="addTouch(\'' + id + '\')">+ Touch</button>' +
    '</div>';

  document.getElementById('po').classList.add('on');
}

export function closeP() { document.getElementById('po').classList.remove('on'); }

export function qs(id, s) {
  const c = S.contacts.find(function(x) { return x.id === id; });
  if (!c) return;
  const _prev = c.status;
  if (_prev === s) return;
  c.status_changed_at = td();
  c.status = s;
  touchContactNow(c);
  touchLastContacted(c);
  bumpCall();
  if (!c.touches) c.touches = [];
  const TOUCH_MAP = { kein_anschluss:'Nicht erreicht', gatekeeper:'Gatekeeper', callback:'Rückruf erbeten',
    set_appointment:'Set Appointment', closed:'Closed', disqualified:'Disqualified', mofo:'MoFo' };
  c.touches.push({ status: TOUCH_MAP[s] || (STATUS[s] ? STATUS[s].label : s), datum: td(), notiz: '' });
  markDirty(c);
  schedulePersist();
  closeP();
  toast('Status: ' + (STATUS[s] ? STATUS[s].label : s));
  onStatusChanged(c.id, c.firma || c.company_name, _prev, s);
  renderStats();
  patchContactRow(c.id);
  schedulePushDirty();
  if (s === 'set_appointment' || s === 'closed') {
    promptAutoClient(c, s);
    showDemoTodoPopup(c);
  }
  if (s === 'set_appointment') {
    maybeOfferCalendar(c, 'demo');
  }
}

export function inlineFUFocus(inp) {
  const id = inp.dataset.id;
  S.pinContactId = id;
  const tr = inp.closest('tr');
  if (tr) {
    const rows = kbRows();
    const idx = rows.indexOf(tr);
    S.pinListIndex = idx >= 0 ? idx : null;
  }
}

export function inlineFU(inp) {
  const c = S.contacts.find(function(x) { return x.id === inp.dataset.id; });
  if (!c) return;
  const prev = c.followup || '';
  c.followup = inp.value;
  S.pinContactId = c.id;
  markDirty(c);
  recordOutreachOnFollowupChange(c, prev, c.followup, { skipStatusAuto: true });
  schedulePersist();
  schedulePushDirty();
  patchFollowupRow(c.id);
  if (c.status === 'callback' && c.followup && c.followup !== prev) {
    maybeOfferCalendar(c, 'rueckruf');
  }
}

export function inlineFUBlur(inp) {
  const id = inp.dataset.id;
  setTimeout(function() {
    const row = document.querySelector('#tbody tr[data-id="' + id + '"]');
    if (row && row.contains(document.activeElement)) return;
    if (S.pinContactId !== id) return;
    clearTablePin();
    invalidateFilterCache();
  }, 80);
}

export function shiftFU(days) {
  const el = document.getElementById('efu');
  const base = el.value ? new Date(el.value) : new Date();
  base.setDate(base.getDate() + days);
  el.value = base.toISOString().slice(0,10);
}

export function saveNotiz(ta) {
  const c = S.contacts.find(function(x) { return x.id === ta.dataset.id; });
  if (!c) return;
  const val = ta.value.trim();
  if (val === (c.notiz || c.besonderheit || '').trim()) return;
  c.notiz = val; c.besonderheit = val;
  markDirty(c);
  schedulePersist();
  schedulePushDirty();
  patchContactRow(c.id);
  ta.classList.add('autosaved');
  setTimeout(function() {
    ta.classList.remove('autosaved');
  }, 1400);
}

export function notizKey(e, ta) {
  if (e.key === 'Escape') { ta.blur(); }
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ta.blur(); }
}

export function openQN(id) {
  const c = S.contacts.find(function(x) { return x.id === id; });
  if (!c) return;
  S.qnId = id;
  document.getElementById('qnTitle').textContent = c.firma;
  document.getElementById('qnText').value = c.notiz || c.besonderheit || '';
  document.getElementById('qnPop').classList.add('on');
  setTimeout(function() { document.getElementById('qnText').focus(); }, 50);
}

export function closeQN() { document.getElementById('qnPop').classList.remove('on'); S.qnId = null; }

export function saveQN() {
  const c = S.contacts.find(function(x) { return x.id === S.qnId; });
  if (!c) return;
  c.notiz = document.getElementById('qnText').value.trim();
  c.besonderheit = c.notiz;
  markDirty(c);
  schedulePersist();
  schedulePushDirty();
  closeQN();
  patchContactRow(c.id);
  toast('Notiz gespeichert.');
}

export function kbRows() { return Array.from(document.querySelectorAll('#tbody tr')); }

export function kbMove(delta) {
  const rows = kbRows(); if (!rows.length) return;
  rows.forEach(function(r) { r.classList.remove('kb-focus'); });
  S.kbIdx = Math.max(0, Math.min(rows.length - 1, S.kbIdx + delta));
  rows[S.kbIdx].classList.add('kb-focus');
  rows[S.kbIdx].scrollIntoView({ block: 'nearest' });
}

export function kbOpen() {
  const rows = kbRows();
  if (S.kbIdx >= 0 && rows[S.kbIdx]) rows[S.kbIdx].click();
}

export function kbEdit() {
  const rows = kbRows();
  if (S.kbIdx < 0 || !rows[S.kbIdx]) return;
  const btn = rows[S.kbIdx].querySelector('button[title="Bearbeiten"]');
  if (btn) btn.click();
}

export function inlineST(sel) {
  const c = S.contacts.find(function(x) { return x.id === sel.dataset.id; });
  if (!c) return;
  const prev = c.status;
  c.status = sel.value;
  if (prev === c.status) return;
  touchLastContacted(c);
  clearTablePin();
  bumpCall();
  c.status_changed_at = td();
  touchContactNow(c);
  syncLeadTemp(c);
  markDirty(c);
  schedulePersist();
  toast('Status: ' + (STATUS[c.status] ? STATUS[c.status].label : c.status));
  onStatusChanged(c.id, c.firma || c.company_name, prev, c.status);
  renderStats();
  patchContactRow(c.id);
  schedulePushDirty();
  if (c.status === 'set_appointment' || c.status === 'closed') {
    promptAutoClient(c, c.status);
    showDemoTodoPopup(c);
  }
  if (c.status === 'set_appointment') {
    maybeOfferCalendar(c, 'demo');
  }
}

function injectCustomGewerke() {
  const sel = document.getElementById('egew');
  if (!sel) return;
  Array.from(sel.options).forEach(function(opt) { if (opt.dataset.custom) sel.removeChild(opt); });
  const customs = getCustomGewerke();
  if (!customs.length) return;
  const anchor = Array.from(sel.options).find(function(o) { return o.value === 'Sonstiges'; });
  customs.forEach(function(name) {
    const opt = document.createElement('option');
    opt.value = name; opt.textContent = name; opt.dataset.custom = '1';
    anchor ? sel.insertBefore(opt, anchor) : sel.appendChild(opt);
  });
}

window.showNewGewerkInput = function() {
  const row = document.getElementById('newGewerkRow');
  if (row) { row.style.display = 'block'; document.getElementById('newGewerkInput').focus(); }
};

window.cancelNewGewerk = function() {
  const row = document.getElementById('newGewerkRow');
  if (row) row.style.display = 'none';
  const input = document.getElementById('newGewerkInput');
  if (input) input.value = '';
};

window.confirmNewGewerk = function() {
  const input = document.getElementById('newGewerkInput');
  const name = (input ? input.value : '').trim();
  if (!name) { toast('Bitte einen Gewerk-Namen eingeben.'); return; }
  addCustomGewerk(name);
  const lb = (document.getElementById('elb') || {}).value || '';
  pushGewerkCloud(name, lb);
  injectCustomGewerke();
  const sel = document.getElementById('egew');
  if (sel) sel.value = name;
  window.cancelNewGewerk();
  toast('Gewerk „' + name + '" angelegt.');
};

export function openAdd() {
  S.eid = null;
  document.getElementById('mt').textContent = 'Kontakt hinzufügen';
  const delBtn = document.getElementById('deleteContactBtn');
  if (delBtn) delBtn.style.display = 'none';
  clrF();
  injectCustomGewerke();
  fillLbSelect('elb', '');
  const tm = new Date(); tm.setDate(tm.getDate() + 1);
  document.getElementById('efu').value = tm.toISOString().slice(0,10);
  document.getElementById('eo').classList.add('on');
}

export function toggleDealField(status) {
  const row = document.getElementById('eDealRow');
  const deal = document.getElementById('eDeal');
  if (!row) return;
  const show = status === 'closed';
  row.style.display = show ? '' : 'none';
  if (show && deal && !deal.value) deal.value = '1800';
}

export function openE(id) {
  const c = S.contacts.find(function(x) { return x.id === id; });
  if (!c) return;
  S.eid = id;
  document.getElementById('mt').textContent    = 'Kontakt bearbeiten';
  const delBtn = document.getElementById('deleteContactBtn');
  if (delBtn) delBtn.style.display = 'inline-flex';
  document.getElementById('ef').value          = c.firma        || '';
  document.getElementById('ek').value          = c.kontakt      || '';
  document.getElementById('etit').value        = c.title        || '';
  document.getElementById('et').value          = c.telefon      || '';
  document.getElementById('em').value          = c.email        || '';
  document.getElementById('ew').value          = c.website      || '';
  document.getElementById('es').value          = c.status       || 'neu';
  document.getElementById('efu').value         = c.followup     || '';
  document.getElementById('er').value          = c.roi ? String(c.roi) : '';
  document.getElementById('erev').value        = c.reviews      || '';
  document.getElementById('estad').value       = c.stadt        || '';
  document.getElementById('ereg').value        = c.region       || '';
  document.getElementById('eplz').value        = c.plz          || '';
  document.getElementById('estr').value        = c.strasse      || '';
  injectCustomGewerke();
  document.getElementById('egew').value        = c.gewerk       || '';
  fillLbSelect('elb', c.lebensbereich || '');
  document.getElementById('eorigin').value     = c.lead_origin  || 'manual';
  document.getElementById('etemp').value       = c.lead_temp    || 'cold';
  document.getElementById('eext').checked      = !!c.is_external;
  const soc = getSocials(c);
  document.getElementById('eli').value         = soc.linkedin   || '';
  document.getElementById('eig').value         = soc.instagram  || '';
  document.getElementById('ex').value          = soc.x          || '';
  document.getElementById('efb').value         = soc.facebook   || '';
  document.getElementById('ewa').value         = soc.whatsapp   || '';
  document.getElementById('en').value          = c.besonderheit || c.notiz || '';
  const dealEl = document.getElementById('eDeal');
  if (dealEl) dealEl.value = c.deal_value_eur != null ? String(c.deal_value_eur) : '';
  toggleDealField(c.status || 'neu');
  document.getElementById('eo').classList.add('on');
}

export function closeE() { document.getElementById('eo').classList.remove('on'); clrF(); }

function clrF() {
  ['ef','ek','etit','et','em','ew','efu','erev','en','estad','ereg','eplz','estr','eli','eig','ex','efb','ewa'].forEach(function(i) {
    const el = document.getElementById(i); if (el) el.value = '';
  });
  document.getElementById('es').value = 'neu';
  document.getElementById('er').value = '';
  document.getElementById('egew').value = '';
  document.getElementById('eorigin').value = 'manual';
  document.getElementById('etemp').value = 'cold';
  const ext = document.getElementById('eext'); if (ext) ext.checked = false;
  const dealEl = document.getElementById('eDeal'); if (dealEl) dealEl.value = '';
  toggleDealField('neu');
  fillLbSelect('elb', '');
}

export function save() {
  const f = document.getElementById('ef').value.trim();
  if (!f) { toast('Firma fehlt.'); return; }
  const d = {
    firma:       f,
    kontakt:     document.getElementById('ek').value.trim(),
    title:       document.getElementById('etit').value.trim(),
    telefon:     document.getElementById('et').value.trim(),
    email:       document.getElementById('em').value.trim(),
    website:     normalizeWebsite(document.getElementById('ew').value),
    status:      document.getElementById('es').value,
    followup:    document.getElementById('efu').value,
    roi:         parseInt(document.getElementById('er').value) || null,
    reviews:     document.getElementById('erev').value.trim(),
    stadt:       document.getElementById('estad').value.trim(),
    region:      document.getElementById('ereg').value.trim(),
    gewerk:      normalizeGewerk(document.getElementById('egew').value),
    lebensbereich: document.getElementById('elb').value || null,
    lead_origin: document.getElementById('eorigin').value || 'manual',
    lead_temp:   document.getElementById('etemp').value || 'cold',
    is_external: !!document.getElementById('eext').checked,
    socials:     readSocialsFromForm('e'),
    plz:         document.getElementById('eplz').value.trim(),
    strasse:     document.getElementById('estr').value.trim(),
    besonderheit:document.getElementById('en').value.trim(),
    notiz:       document.getElementById('en').value.trim(),
  };
  const dealRaw = document.getElementById('eDeal') ? document.getElementById('eDeal').value.trim() : '';
  if (d.status === 'closed' && dealRaw) d.deal_value_eur = parseFloat(dealRaw) || 1800;
  else if (d.status !== 'closed') d.deal_value_eur = null;
  if (S.eid) {
    const i = S.contacts.findIndex(function(c) { return c.id === S.eid; });
    if (i >= 0) {
      const prevFu = S.contacts[i].followup || '';
      const prevStatus = S.contacts[i].status;
      const statusChanged = prevStatus !== d.status;
      if (statusChanged) d.status_changed_at = td();
      S.contacts[i] = Object.assign({}, S.contacts[i], d, { synced_at: null });
      const name = S.contacts[i].firma || S.contacts[i].company_name || '';
      if ((d.followup || '') !== prevFu) {
        recordOutreachOnFollowupChange(S.contacts[i], prevFu, d.followup || '', {
          statusFromForm: d.status,
          prevStatus: prevStatus,
        });
      } else if (statusChanged) {
        syncLeadTemp(S.contacts[i]);
        onStatusChanged(S.contacts[i].id, name, prevStatus, d.status);
      }
    }
  } else {
    const neu = Object.assign({
      id: gid(), created: Date.now(), touches:[{status:'',datum:'',notiz:''}], synced_at: null,
      lead_origin: 'manual', lead_temp: 'cold', socials: {},
    }, d);
    syncLeadTemp(neu);
    S.contacts.push(neu);
  }
  if (d.gewerk) pushGewerkCloud(d.gewerk, d.lebensbereich);
  invalidateFilterCache();
  schedulePersist();
  closeE();
  render();
  schedulePushDirty();
  toast(S.eid ? 'Gespeichert.' : 'Kontakt hinzugefügt.');
}

export async function del(id) {
  id = id || S.eid;
  if (!id) { toast('Kein Kontakt zum Löschen.'); return; }
  const c = S.contacts.find(function(x) { return x.id === id; });
  const label = (c && c.firma) ? c.firma : 'diesen Lead';
  if (!confirm('„' + label + '“ wirklich löschen?\n\nDer Lead wird unwiderruflich aus der Datenbank entfernt.')) return;
  if (S.syncInProgress) { toast('Sync läuft — bitte kurz warten.'); return; }
  try {
    await sbDelete('/rest/v1/crm_contacts?id=eq.' + id);
  } catch(e) {
    toast('Löschen fehlgeschlagen: ' + e.message);
    return;
  }
  S.contacts = S.contacts.filter(function(x) { return x.id !== id; });
  schedulePersist();
  closeE();
  if (typeof window.closeP === 'function') window.closeP();
  render();
  toast('Gelöscht.');
}

export function openPurgeDq() {
  const dqContacts = S.contacts.filter(function(c) { return PURGE_STATUSES.indexOf(c.status) >= 0; });
  document.getElementById('purge-count').textContent = dqContacts.length;
  document.getElementById('purgeDqModal').classList.add('on');
}

export function closePurgeDq() {
  document.getElementById('purgeDqModal').classList.remove('on');
}

export async function purgeDq(mode) {
  const dqContacts = S.contacts.filter(function(c) { return PURGE_STATUSES.indexOf(c.status) >= 0; });
  if (!dqContacts.length) { closePurgeDq(); return; }
  if (S.syncInProgress) { toast('Sync läuft — bitte kurz warten.'); closePurgeDq(); return; }

  const btn = document.getElementById('purgeBtn');
  btn.disabled = true;
  closePurgeDq();

  try {
    if (mode === 'archive') {
      dqContacts.forEach(function(c) { c.status = 'disqualified'; });
      for (let i = 0; i < dqContacts.length; i += 50) {
        const batch = dqContacts.slice(i, i + 50);
        await sbUpsert('/rest/v1/crm_contacts', batch.map(function(c) {
          return { id: c.id, status: 'disqualified', synced_at: new Date().toISOString() };
        }));
      }
      schedulePersist();
      renderStats();
      renderTableBody();
      toast(dqContacts.length + ' Leads als Disqualified markiert.');
    } else {
      const ids = dqContacts.map(function(c) { return c.id; });
      for (let i = 0; i < ids.length; i += 50) {
        const batch = ids.slice(i, i + 50);
        const idList = batch.map(function(id) { return 'id.eq.' + id; }).join(',');
        await sbDelete('/rest/v1/crm_contacts?or=(' + idList + ')');
      }
      S.contacts = S.contacts.filter(function(c) { return PURGE_STATUSES.indexOf(c.status) < 0; });
      schedulePersist();
      renderStats();
      renderTableBody();
      toast(ids.length + ' Leads gelöscht (Disqualified + MoFo).');
    }
  } catch(e) {
    toast('Fehler: ' + e.message);
  } finally {
    btn.disabled = false;
  }
}

export function doSort(col) {
  clearTablePin();
  invalidateFilterCache();
  const idx = S.sortStack.findIndex(function(s) { return s.col === col; });
  if (idx === -1) {
    S.sortStack.push({ col: col, dir: 1 });
  } else if (S.sortStack[idx].dir === 1) {
    S.sortStack[idx].dir = -1;
  } else {
    S.sortStack.splice(idx, 1);
  }
  render();
}

export function toggleColMenu(e) {
  e.stopPropagation();
  document.getElementById('ctdrop').classList.toggle('on');
}

export function toggleCol(col) {
  S.colVis[col] = !S.colVis[col];
  localStorage.setItem('rais_crm_colvis', JSON.stringify(S.colVis));
  const cb = document.getElementById('cv-' + col);
  if (cb) cb.checked = !!S.colVis[col];
  render();
}

function _ensureContactExtra(c) {
  if (!c.extra || typeof c.extra !== 'object') c.extra = {};
  return c.extra;
}

function _clearAktionExtra(c) {
  const ex = _ensureContactExtra(c);
  ex.aktion_noetig = false;
  delete ex.aktion_notiz;
}

function _initAktionPopChips() {
  const host = document.getElementById('aktionChips');
  if (!host || host.dataset.ready) return;
  host.dataset.ready = '1';
  host.innerHTML = AKTION_SUGGESTIONS.map(function(s) {
    return '<button type="button" class="aktion-chip-btn" onclick="fillAktionSuggestion(' + JSON.stringify(s) + ')">' + esc(s) + '</button>';
  }).join('');
}

export function openAktionPop(id) {
  _initAktionPopChips();
  const c = S.contacts.find(function(x) { return x.id === id; });
  if (!c) return;
  _aktionPopId = id;
  document.getElementById('aktionPopTitle').textContent = c.firma || 'Lead';
  document.getElementById('aktionText').value = (c.extra && c.extra.aktion_notiz) || '';
  const clearBtn = document.getElementById('aktionPopClear');
  if (clearBtn) clearBtn.hidden = !isAktionNoetig(c);
  document.getElementById('aktionPop').classList.add('on');
  setTimeout(function() { document.getElementById('aktionText').focus(); }, 50);
}

export function closeAktionPop() {
  document.getElementById('aktionPop').classList.remove('on');
  _aktionPopId = null;
}

export function fillAktionSuggestion(text) {
  document.getElementById('aktionText').value = text;
}

export function saveAktionPop() {
  const c = S.contacts.find(function(x) { return x.id === _aktionPopId; });
  if (!c) return;
  const text = document.getElementById('aktionText').value.trim();
  if (!text) {
    toast('Bitte kurz beschreiben, was zu tun ist.');
    return;
  }
  const ex = _ensureContactExtra(c);
  ex.aktion_noetig = true;
  ex.aktion_notiz = text;
  markDirty(c);
  if (getActiveSession()) upsertAktionLead(c.id, c.firma || '', text);
  schedulePersist();
  schedulePushDirty();
  closeAktionPop();
  renderStats();
  patchContactRow(c.id);
  renderAktionQueueBar();
  toast('Aktion gespeichert.');
}

export function clearAktionPop() {
  const c = S.contacts.find(function(x) { return x.id === _aktionPopId; });
  if (!c) return;
  _clearAktionExtra(c);
  markDirty(c);
  removeAktionLead(c.id);
  schedulePersist();
  schedulePushDirty();
  closeAktionPop();
  renderStats();
  patchContactRow(c.id);
  renderAktionQueueBar();
  toast('Markierung aufgehoben.');
}

export function checkAktionItem(contactId) {
  const c = S.contacts.find(function(x) { return x.id === contactId; });
  if (!c) return;
  _clearAktionExtra(c);
  markDirty(c);
  completeAktionItem(contactId);
  schedulePersist();
  schedulePushDirty();
  renderStats();
  patchContactRow(contactId);
  renderAktionQueueBar();
  toast('Aktion erledigt.');
}

export function scrollToAktionQueue() {
  const bar = document.getElementById('aktion-queue-bar');
  if (bar) bar.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

export function applyColPreset(preset, silent) {
  if (preset === 'calling') {
    S.colVis = { stadt: false, region: false, gewerk: false, origin: true, temp: false, lebensbereich: false };
  } else if (preset === 'full') {
    S.colVis = { stadt: true, region: true, gewerk: true, origin: true, temp: true, lebensbereich: true };
  }
  localStorage.setItem('rais_crm_colvis', JSON.stringify(S.colVis));
  ['stadt','region','gewerk','origin','temp','lebensbereich'].forEach(function(k) {
    const cb = document.getElementById('cv-' + k);
    if (cb) cb.checked = !!S.colVis[k];
  });
  const drop = document.getElementById('ctdrop');
  if (drop) drop.classList.remove('on');
  render();
  if (!silent) toast('Spalten-Preset angewendet.');
}

export function openPurgeVersicherung() {
  const hits = S.contacts.filter(isVersicherungsLead);
  document.getElementById('purge-vers-count').textContent = hits.length;
  document.getElementById('purgeVersicherungModal').classList.add('on');
}

export function closePurgeVersicherung() {
  document.getElementById('purgeVersicherungModal').classList.remove('on');
}

export function closeSessionCelebration() {
  document.getElementById('sessionCelebrationPop').classList.remove('on');
  clearCelebrationAktionQueue();
  const remaining = S.contacts.filter(isAktionNoetig).length;
  if (remaining > 0) {
    toast(remaining + ' Lead(s) brauchen noch eine Aktion — Filter „Aktion“ nutzen.');
  }
}

export async function purgeVersicherungsmakler() {
  const hits = S.contacts.filter(isVersicherungsLead);
  if (!hits.length) { closePurgeVersicherung(); return; }
  if (!confirm(hits.length + ' Versicherungs-Leads unwiderruflich löschen?')) return;
  if (S.syncInProgress) { toast('Sync läuft — bitte kurz warten.'); closePurgeVersicherung(); return; }

  const btn = document.getElementById('purgeVersBtn');
  if (btn) btn.disabled = true;
  closePurgeVersicherung();

  try {
    const ids = hits.map(function(c) { return c.id; });
    for (let i = 0; i < ids.length; i += 50) {
      const batch = ids.slice(i, i + 50);
      const idList = batch.map(function(id) { return 'id.eq.' + id; }).join(',');
      await sbDelete('/rest/v1/crm_contacts?or=(' + idList + ')');
    }
    const remove = new Set(ids);
    S.contacts = S.contacts.filter(function(c) { return !remove.has(c.id); });
    schedulePersist();
    render();
    toast(ids.length + ' Versicherungs-Leads gelöscht.');
  } catch(e) {
    toast('Fehler: ' + e.message);
  } finally {
    if (btn) btn.disabled = false;
  }
}

document.addEventListener('click', function(e) {
  if (!e.target.closest || !e.target.closest('.coltog')) {
    const d = document.getElementById('ctdrop');
    if (d) d.classList.remove('on');
  }
});

window.addEventListener('rais:page-change', function(e) {
  if (e.detail.page === 'prospecting') render();
});
