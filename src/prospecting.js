import { S, PG, STATUS, TSTAT, TSCLS } from './state.js';
import { gid, td, relAge, gewerkKuerzel, gewerkSlug } from './utils.js';
import { sbadge, roib, fdc, esc, ir, toast } from './ui.js';
import { markDirty, persist, pushDirty } from './sync.js';
import { sbDelete, sbUpsert } from './supabase.js';
import { emailBadge, emailPanelHtml } from './email.js';
import { renderCalls, bumpCall } from './calls.js';
import { onStatusChanged, onOutreachRecorded, getActiveSession } from './sessions.js';
import { promptAutoClient } from './clients.js';
import { showDemoTodoPopup } from './todopop.js';

export function isVersicherungsLead(c) {
  if (!c) return false;
  const hay = [
    c.gewerk, c.firma, c.besonderheit, c.notiz,
    c.hauptleistung, c.extra && c.extra.hauptleistung,
  ].filter(Boolean).join(' ').toLowerCase();
  return /versicherung|versicherungsmakler|versicherungsagentur|versicherungsbüro|versicherungsberatung/.test(hay);
}

export function getList() {
  const q      = document.getElementById('srch').value.toLowerCase();
  const roi    = document.getElementById('roiF').value;
  const gewF   = document.getElementById('gewerkF').value;
  const srt    = document.getElementById('sortS').value;
  let list = S.contacts.filter(function(c) {
    if (S.flt === 'heute') { const t = td(); return c.followup && c.followup <= t; }
    if (S.flt !== 'all' && c.status !== S.flt) return false;
    if (roi === '0' && c.roi) return false;
    if (roi && roi !== '0' && String(c.roi||'') !== roi) return false;
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
  return list;
}

export function setF(f) {
  S.flt = f; S.pg = 1; S.dueMode = false;
  document.querySelectorAll('.stat').forEach(function(el) { el.classList.remove('on'); });
  const map = {all:'s-all', neu:'s-neu', kein_anschluss:'s-ka', kein_anschluss_2:'s-ka2', gatekeeper:'s-gk',
               callback:'s-cb', email_nurture:'s-en', interessiert:'s-int', demo_termin:'s-dt',
               door_open:'s-do', no_show:'s-ns', disqualified:'s-dq', ghost:'s-gh',
               gewonnen:'s-gw', heute:'s-heute'};
  if (map[f]) document.getElementById(map[f]).classList.add('on');
  render();
}

export function filterDue() { S.dueMode = true; S.pg = 1; render(); }

const OUTREACH_PROTECTED = ['gewonnen', 'demo_termin', 'door_open', 'interessiert', 'disqualified', 'archiviert', 'ghost'];

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

  if (!userChangedStatus && !OUTREACH_PROTECTED.includes(c.status)) {
    c.status = 'kein_anschluss_2';
  } else if (statusFromForm != null) {
    c.status = statusFromForm;
  }

  bumpCall();
  markDirty(c);

  const name = c.firma || c.company_name || '';
  if (userChangedStatus) {
    onStatusChanged(c.id, name, prevStatus, c.status);
  } else if (prevStatus === 'kein_anschluss_2' && c.status === 'kein_anschluss_2') {
    onOutreachRecorded(c.id, name, prevStatus, 'kein_anschluss_2');
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
    const st = STATUS[c.status] || { cls: 'b-neu', label: 'Neu' };
    const badge = '<span class="badge ' + st.cls + '">' + esc(st.label) + '</span>';
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
    const note = (c.notiz || c.besonderheit || '').trim();
    const phoneBtn = c.telefon
      ? '<a class="mc-call-btn" href="tel:' + esc(c.telefon) + '" onclick="event.stopPropagation()">&#128222; ' + esc(c.telefon) + '</a>'
      : '';
    return (
      '<div class="mc" onclick="openP(\'' + c.id + '\')">' +
        '<div class="mc-top">' +
          '<div class="mc-firma">' + esc(c.firma) + '</div>' +
          '<div class="mc-right">' + badge + roi + '</div>' +
        '</div>' +
        '<div class="mc-mid">' + gwBadge + stadtStr + fuPill + touchPill + '</div>' +
        (note ? '<div class="mc-note">' + esc(note) + '</div>' : '') +
        phoneBtn +
      '</div>'
    );
  }).join('');
}

function populateGewerkFilter() {
  const sel = document.getElementById('gewerkF');
  if (!sel) return;
  const unique = [...new Set(S.contacts.map(function(c) { return c.gewerk; }).filter(Boolean))].sort();
  const current = sel.value;
  sel.innerHTML = '<option value="">Gewerk: Alle</option>' +
    unique.map(function(g) { return '<option value="' + g + '"' + (g === current ? ' selected' : '') + '>' + g + '</option>'; }).join('');
}

export function render() {
  populateGewerkFilter();
  const t = td();
  const cnt = {all: S.contacts.length};
  Object.keys(STATUS).forEach(function(k) { cnt[k] = S.contacts.filter(function(c) { return c.status === k; }).length; });
  document.getElementById('c-all').textContent = cnt.all;
  document.getElementById('c-neu').textContent = cnt.neu          || 0;
  document.getElementById('c-ka').textContent  = cnt.kein_anschluss || 0;
  const ka2El = document.getElementById('c-ka2');
  if (ka2El) ka2El.textContent = cnt.kein_anschluss_2 || 0;
  document.getElementById('c-gk').textContent  = cnt.gatekeeper   || 0;
  document.getElementById('c-cb').textContent  = cnt.callback     || 0;
  document.getElementById('c-en').textContent  = cnt.email_nurture|| 0;
  document.getElementById('c-int').textContent = cnt.interessiert || 0;
  document.getElementById('c-dt').textContent  = cnt.demo_termin  || 0;
  document.getElementById('c-do').textContent  = cnt.door_open    || 0;
  document.getElementById('c-ns').textContent  = cnt.no_show      || 0;
  document.getElementById('c-dq').textContent  = cnt.disqualified || 0;
  const ghEl = document.getElementById('c-gh');
  if (ghEl) ghEl.textContent = cnt.ghost || 0;
  document.getElementById('c-gw').textContent  = cnt.gewonnen     || 0;

  const due = S.contacts.filter(function(c) { return c.followup && c.followup <= t; }).length;
  document.getElementById('c-heute').textContent = due;
  document.getElementById('banner').classList.toggle('on', due > 0);
  document.getElementById('bannerC').textContent = due;
  renderCalls();

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
    thF('#','width:36px;text-align:right;color:#B0A898;font-size:10px','col-sticky-num') +
    thS('firma','Firma','col-sticky-firma') +
    thF('Ansprechpartner') + thF('Telefon') +
    thS('roi','ROI') + thS('status','Status') + thS('followup','Follow-up') +
    thF('T1 / Notiz') + thS('reviews','Reviews') +
    (S.colVis.website ? thF('&#127760;','width:36px;text-align:center') : '') +
    (S.colVis.stadt   ? thS('stadt','Stadt') : '') +
    (S.colVis.region  ? thS('region','Region') : '') +
    (S.colVis.gewerk  ? thS('gewerk','Gewerk') : '') +
    thF('Email','width:44px;text-align:center') +
    thF('','width:48px') +
  '</tr>';

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
      const ovr = (c.followup && c.followup < t) ? ' ov' : '';
      const t1  = (c.touches && c.touches[0]) || {};
      const note = (t1.status || t1.notiz || c.besonderheit || c.notiz || '').slice(0, 55);
      const lastT = (c.touches && c.touches.slice().reverse().find(function(t){ return t.datum; })) || null;
      const lastTDatum = lastT ? lastT.datum : null;
      const lastTAge = lastTDatum ? Math.floor((new Date(td()) - new Date(lastTDatum)) / 86400000) : null;
      const ageCls = lastTAge === null ? '' : (lastTAge <= 3 ? 'age-fresh' : lastTAge <= 7 ? 'age-warn' : 'age-old');
      const ageStr = lastTDatum ? relAge(lastTDatum) : (c.created ? relAge(new Date(c.created).toISOString().slice(0,10)) : null);
      return '<tr class="' + ovr + '" onclick="openP(\'' + c.id + '\')">' +
        '<td class="col-sticky-num" style="text-align:right;font-family:sans-serif;font-size:11px;color:#B0A898;padding-right:10px;user-select:none">' + (pageOffset + i + 1) + '</td>' +
        '<td class="fc col-sticky-firma">' + esc(c.firma) + (c.gewerk ? '<span class="gw-badge gw-' + gewerkSlug(c.gewerk) + '">' + gewerkKuerzel(c.gewerk) + '</span>' : '') + '</td>' +
        '<td>' + esc(c.kontakt || '—') + '</td>' +
        '<td><a href="tel:' + esc(c.telefon) + '" onclick="event.stopPropagation()" style="color:#2C5F8A;text-decoration:none;font-family:monospace;font-size:12.5px">' + esc(c.telefon || '—') + '</a></td>' +
        '<td onclick="event.stopPropagation()"><select class="idd roi-dd roi-' + (c.roi||0) + '" data-id="' + c.id + '" onchange="inlineROI(this)">' +
          '<option value=""'  + (!c.roi?          ' selected':'') + '>— offen</option>' +
          '<option value="1"' + (c.roi==1?' selected':'') + '>① Niedrig</option>' +
          '<option value="2"' + (c.roi==2?' selected':'') + '>② Mittel</option>' +
          '<option value="3"' + (c.roi==3?' selected':'') + '>③ Hoch</option>' +
        '</select></td>' +
        '<td class="st-cell-badge" onclick="event.stopPropagation();openP(\'' + c.id + '\')" title="Status im Panel ändern">' + sbadge(c.status) + '</td>' +
        '<td onclick="event.stopPropagation()" class="fu-cell"><input type="date" class="idd-date" data-id="' + c.id + '" value="' + esc(c.followup||'') + '" onchange="inlineFU(this)" title="Follow-up Datum"></td>' +
        '<td class="notiz-cell" onclick="event.stopPropagation()">' +
          '<textarea class="notiz-ta" data-id="' + c.id + '" rows="2" placeholder="Notiz…" onblur="saveNotiz(this)" onkeydown="notizKey(event,this)">' + esc(c.notiz || '') + '</textarea>' +
          (ageStr ? '<span class="age-lbl ' + ageCls + '">' + (lastTDatum ? '&#128222; ' : '') + ageStr + '</span>' : '') +
        '</td>' +
        '<td style="font-family:sans-serif;font-size:12px;color:#7B746B">' + esc(c.reviews || '—') + '</td>' +
        (S.colVis.website ? '<td style="text-align:center" onclick="event.stopPropagation()">' + (c.website ? '<a class="wlink" href="' + esc(c.website) + '" target="_blank" rel="noopener" title="' + esc(c.website) + '">&#127760;</a>' : '<span class="wlink-none">&#127760;</span>') + '</td>' : '') +
        (S.colVis.stadt   ? '<td style="font-family:sans-serif;font-size:12px">' + esc(c.stadt  || '—') + '</td>' : '') +
        (S.colVis.region  ? '<td style="font-family:sans-serif;font-size:12px">' + esc(c.region || '—') + '</td>' : '') +
        (S.colVis.gewerk  ? '<td style="font-family:sans-serif;font-size:12px">' + esc(c.gewerk || '—') + '</td>' : '') +
        '<td onclick="event.stopPropagation()" style="white-space:nowrap">' + emailBadge(c) + '</td>' +
        '<td class="ra-cell" onclick="event.stopPropagation()"><div class="ra">' +
          '<button class="btn bg bsm" onclick="openQN(\'' + c.id + '\')" title="Schnellnotiz">&#128221;</button>' +
          '<button class="btn bg bsm" onclick="openE(\'' + c.id + '\')" title="Bearbeiten">&#9998;</button>' +
        '</div></td>' +
      '</tr>';
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

  if (typeof countEligible === 'function') {
    [1,2,3].forEach(function(n) {
      const el = document.getElementById('bulkCnt' + n);
      if (el) el.textContent = '(' + countEligible(n) + ')';
    });
  }
}

export function goPg(p) { S.pg = p; render(); }

export function openP(id) {
  const c = S.contacts.find(function(x) { return x.id === id; });
  if (!c) return;
  document.getElementById('pFirma').textContent = c.firma;
  document.getElementById('pSub').textContent = [c.title, c.kontakt].filter(Boolean).join(' · ');
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
    ir('Website', c.website ? '<a href="' + esc(c.website) + '" target="_blank" rel="noopener">' + esc(c.website.replace(/^https?:\/\//,'')) + '</a>' : '—') +
    (c.facebook ? ir('Facebook', '<a href="' + esc(c.facebook) + '" target="_blank" rel="noopener">Profil öffnen</a>') : '') +
    '<div class="sh">Status</div>' +
    ir('Status',    sbadge(c.status) + (c.status_changed_at ? '<span style="font-size:11px;color:#B0A898;margin-left:7px;font-family:sans-serif">seit ' + relAge(c.status_changed_at) + ' (' + c.status_changed_at + ')</span>' : '')) +
    ir('ROI',       roib(c.roi)) +
    ir('Follow-up', fdc(c.followup)) +
    ((c.stadt||c.region) ? ir('Ort', esc([c.stadt,c.region].filter(Boolean).join(', '))) : '') +
    (c.gewerk ? ir('Gewerk', esc(c.gewerk)) : '') +
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
      '<button class="qs-chip" onclick="qs(\'' + id + '\',\'kein_anschluss\')">Kein Anschluss</button>' +
      '<button class="qs-chip" onclick="qs(\'' + id + '\',\'kein_anschluss_2\')">Kein Anschluss 2</button>' +
      '<button class="qs-chip" onclick="qs(\'' + id + '\',\'gatekeeper\')">Gatekeeper</button>' +
      '<button class="qs-chip qs-chip-dt" onclick="qs(\'' + id + '\',\'callback\')">Callback</button>' +
      '<button class="qs-chip qs-chip-dt" onclick="qs(\'' + id + '\',\'demo_termin\')">Demo Termin</button>' +
      '<button class="qs-chip qs-chip-dq" onclick="qs(\'' + id + '\',\'disqualified\')">Disqualified</button>' +
      '<button class="qs-chip qs-chip-dq" onclick="qs(\'' + id + '\',\'ghost\')">Ghost</button>' +
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
  if (c.status !== s) c.status_changed_at = td();
  c.status = s;
  bumpCall();
  if (!c.touches) c.touches = [];
  const TOUCH_MAP = { kein_anschluss:'Nicht erreicht', kein_anschluss_2:'Nicht erreicht (2)',
    gatekeeper:'Gatekeeper', callback:'Rückruf erbeten', demo_termin:'Termin vereinbart',
    disqualified:'Kein Interesse', ghost:'Ghost' };
  c.touches.push({ status: TOUCH_MAP[s] || (STATUS[s] ? STATUS[s].label : s), datum: td(), notiz: '' });
  markDirty(c); persist(); render(); pushDirty(); closeP();
  toast('Status: ' + (STATUS[s] ? STATUS[s].label : s));
  onStatusChanged(c.id, c.firma || c.company_name, _prev, s);
  if (s === 'demo_termin' || s === 'gewonnen') {
    promptAutoClient(c, s);
    showDemoTodoPopup(c);
  }
}

export function inlineFU(inp) {
  const c = S.contacts.find(function(x) { return x.id === inp.dataset.id; });
  if (!c) return;
  const prev = c.followup || '';
  c.followup = inp.value;
  markDirty(c);
  recordOutreachOnFollowupChange(c, prev, c.followup);
  persist();
  pushDirty();
  render();
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
  persist(); pushDirty();
  
  // Visuelles Autosave-Feedback
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
  persist(); render(); pushDirty(); closeQN();
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

export function inlineROI(sel) {
  const c = S.contacts.find(function(x) { return x.id === sel.dataset.id; });
  if (!c) return;
  c.roi = parseInt(sel.value) || null;
  markDirty(c);
  persist(); render(); pushDirty();
}

export function inlineST(sel) {
  const c = S.contacts.find(function(x) { return x.id === sel.dataset.id; });
  if (!c) return;
  const prev = c.status;
  c.status = sel.value;
  if (prev !== c.status) { bumpCall(); c.status_changed_at = td(); }
  markDirty(c);
  persist(); render(); pushDirty();
  onStatusChanged(c.id, c.firma || c.company_name, prev, c.status);
  if (c.status === 'demo_termin' || c.status === 'gewonnen') {
    promptAutoClient(c, c.status);
    showDemoTodoPopup(c);
  }
}

export function openAdd() {
  S.eid = null;
  document.getElementById('mt').textContent = 'Kontakt hinzufügen';
  const delBtn = document.getElementById('deleteContactBtn');
  if (delBtn) delBtn.style.display = 'none';
  clrF();
  const tm = new Date(); tm.setDate(tm.getDate() + 1);
  document.getElementById('efu').value = tm.toISOString().slice(0,10);
  document.getElementById('eo').classList.add('on');
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
  document.getElementById('egew').value        = c.gewerk       || '';
  document.getElementById('en').value          = c.besonderheit || c.notiz || '';
  document.getElementById('eo').classList.add('on');
}

export function closeE() { document.getElementById('eo').classList.remove('on'); clrF(); }

function clrF() {
  ['ef','ek','etit','et','em','ew','efu','erev','en','estad','ereg'].forEach(function(i) {
    const el = document.getElementById(i); if (el) el.value = '';
  });
  document.getElementById('es').value = 'neu';
  document.getElementById('er').value = '';
  document.getElementById('egew').value = '';
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
    website:     document.getElementById('ew').value.trim(),
    status:      document.getElementById('es').value,
    followup:    document.getElementById('efu').value,
    roi:         parseInt(document.getElementById('er').value) || null,
    reviews:     document.getElementById('erev').value.trim(),
    stadt:       document.getElementById('estad').value.trim(),
    region:      document.getElementById('ereg').value.trim(),
    gewerk:      document.getElementById('egew').value,
    besonderheit:document.getElementById('en').value.trim(),
    notiz:       document.getElementById('en').value.trim(),
  };
  if (S.eid) {
    const i = S.contacts.findIndex(function(c) { return c.id === S.eid; });
    if (i >= 0) {
      const prevFu = S.contacts[i].followup || '';
      const prevStatus = S.contacts[i].status;
      if (S.contacts[i].status !== d.status) d.status_changed_at = td();
      S.contacts[i] = Object.assign({}, S.contacts[i], d, { synced_at: null });
      if ((d.followup || '') !== prevFu) {
        recordOutreachOnFollowupChange(S.contacts[i], prevFu, d.followup || '', {
          statusFromForm: d.status,
          prevStatus: prevStatus,
        });
      }
    }
  } else {
    S.contacts.push(Object.assign({id: gid(), created: Date.now(), touches:[{status:'',datum:'',notiz:''}], synced_at: null}, d));
  }
  persist(); closeE(); render(); pushDirty();
  toast(S.eid ? 'Gespeichert.' : 'Kontakt hinzugefügt.');
}

export async function del(id) {
  id = id || S.eid;
  if (!id) { toast('Kein Kontakt zum Löschen.'); return; }
  if (!confirm('Kontakt wirklich löschen?')) return;
  if (S.syncInProgress) { toast('Sync läuft — bitte kurz warten.'); return; }
  try {
    await sbDelete('/rest/v1/crm_contacts?id=eq.' + id);
  } catch(e) {
    toast('Löschen fehlgeschlagen: ' + e.message);
    return;
  }
  S.contacts = S.contacts.filter(function(c) { return c.id !== id; });
  persist(); closeE(); render(); toast('Gelöscht.');
}

export function openPurgeDq() {
  const dqContacts = S.contacts.filter(function(c) { return c.status === 'disqualified'; });
  document.getElementById('purge-count').textContent = dqContacts.length;
  document.getElementById('purgeDqModal').classList.add('on');
}

export function closePurgeDq() {
  document.getElementById('purgeDqModal').classList.remove('on');
}

export async function purgeDq(mode) {
  const dqContacts = S.contacts.filter(function(c) { return c.status === 'disqualified'; });
  if (!dqContacts.length) { closePurgeDq(); return; }
  if (S.syncInProgress) { toast('Sync läuft — bitte kurz warten.'); closePurgeDq(); return; }

  const btn = document.getElementById('purgeBtn');
  btn.disabled = true;
  closePurgeDq();

  try {
    if (mode === 'archive') {
      dqContacts.forEach(function(c) { c.status = 'archiviert'; });
      for (let i = 0; i < dqContacts.length; i += 50) {
        const batch = dqContacts.slice(i, i + 50);
        await sbUpsert('/rest/v1/crm_contacts', batch.map(function(c) {
          return { id: c.id, status: 'archiviert', synced_at: new Date().toISOString() };
        }));
      }
      persist(); render();
      toast(dqContacts.length + ' Leads archiviert.');
    } else {
      const ids = dqContacts.map(function(c) { return c.id; });
      for (let i = 0; i < ids.length; i += 50) {
        const batch = ids.slice(i, i + 50);
        const idList = batch.map(function(id) { return 'id.eq.' + id; }).join(',');
        await sbDelete('/rest/v1/crm_contacts?or=(' + idList + ')');
      }
      S.contacts = S.contacts.filter(function(c) { return c.status !== 'disqualified'; });
      persist(); render();
      toast(ids.length + ' Leads gelöscht.');
    }
  } catch(e) {
    toast('Fehler: ' + e.message);
  } finally {
    btn.disabled = false;
  }
}

export function doSort(col) {
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

export function applyColPreset(preset, silent) {
  if (preset === 'calling') {
    S.colVis = { website: false, stadt: false, region: false, gewerk: false };
  } else if (preset === 'full') {
    S.colVis = { website: true, stadt: true, region: true, gewerk: true };
  }
  localStorage.setItem('rais_crm_colvis', JSON.stringify(S.colVis));
  ['website','stadt','region','gewerk'].forEach(function(k) {
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
    persist(); render();
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
