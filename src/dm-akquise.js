import { S, DM_PG, DM_KEY_SB, DM_VIEW_SB, DM_STATUS, DM_STATUS_ORDER } from './state.js';
import { sbGet, sbUpsert, sbDelete } from './supabase.js';
import { esc, escJs, fdc, ir, syncStatusSelectColor, toast } from './ui.js';
import { td } from './utils.js';

function normalizeDmStatus(status) {
  return DM_STATUS[status] ? status : 'erstkontakt';
}

function setDmStatusClass(sel) {
  syncStatusSelectColor(sel);
}

function buildDmRow(lead, keepCreated) {
  const nowIso = new Date().toISOString();
  return {
    id: lead.id || undefined,
    name: (lead.name || '').trim(),
    firma: (lead.firma || '').trim() || null,
    telefon: (lead.telefon || '').trim() || null,
    linkedin_name: (lead.linkedin_name || '').trim() || null,
    linkedin_url: (lead.linkedin_url || '').trim() || null,
    stadt: (lead.stadt || '').trim() || null,
    region: (lead.region || '').trim() || null,
    gewerk: (lead.gewerk || '').trim() || null,
    touch_stufe: lead.touch_stufe != null && lead.touch_stufe !== '' ? Number(lead.touch_stufe) : 0,
    status: normalizeDmStatus(lead.status),
    notiz: (lead.notiz || '').trim() || null,
    next_touch_date: lead.next_touch_date || null,
    crm_contact_id: lead.crm_contact_id || null,
    created_at: keepCreated ? (lead.created_at || nowIso) : nowIso,
    updated_at: nowIso,
  };
}

function rowClassForLead(lead) {
  if (lead.is_duplicate) return 'cross-channel';
  const status = normalizeDmStatus(lead.status);
  if (status === 'follow_up_1' || status === 'follow_up_2') return 'dm-row-wait';
  if (status.indexOf('ghost_') === 0) return 'dm-row-ghost';
  if (status === 'termin_gesetzt') return 'dm-row-won';
  if (status === 'kein_interesse' || status === 'nicht_erreichbar_final' || status === 'disqualified') return 'dm-row-closed';
  return '';
}

function dmStatusSelectHtml(lead) {
  const cur = normalizeDmStatus(lead.status);
  let html = '<select class="idd st-dd st-' + cur + '" data-id="' + lead.id + '" onchange="inlineDmStatus(this)" onclick="event.stopPropagation()">';
  DM_STATUS_ORDER.forEach(function(key) {
    const st = DM_STATUS[key];
    const sel = key === cur ? ' selected' : '';
    html += '<option class="st-opt-' + key + '" value="' + key + '"' + sel + '>' + st.label + '</option>';
  });
  html += '</select>';
  return html;
}

function getDmFilterValue() {
  const statusFilter = document.getElementById('dmStatusF');
  return statusFilter ? statusFilter.value : '';
}

function matchesTileFilter(lead) {
  const f = S.dmFlt || 'all';
  if (f === 'all') return true;
  if (f === 'heute') return !!(lead.next_touch_date && lead.next_touch_date <= td());
  return normalizeDmStatus(lead.status) === f;
}

function getDmList() {
  const q = ((document.getElementById('dm-srch') || { value: '' }).value || '').toLowerCase();
  const statusF = getDmFilterValue();
  return S.dmLeads.filter(function(lead) {
    if (!matchesTileFilter(lead)) return false;
    if (statusF && normalizeDmStatus(lead.status) !== statusF) return false;
    if (q) {
      const hay = [
        lead.name,
        lead.firma,
        lead.linkedin_name,
        lead.telefon,
        lead.status,
        lead.stadt,
        lead.region,
        lead.notiz,
      ].join(' ').toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

function renderDmStats() {
  const counts = { all: S.dmLeads.length, heute: 0 };
  DM_STATUS_ORDER.forEach(function(k) { counts[k] = 0; });
  const today = td();
  S.dmLeads.forEach(function(lead) {
    const st = normalizeDmStatus(lead.status);
    if (counts[st] != null) counts[st]++;
    if (lead.next_touch_date && lead.next_touch_date <= today) counts.heute++;
  });
  Object.keys(counts).forEach(function(k) {
    const el = document.getElementById('dm-c-' + k);
    if (el) el.textContent = String(counts[k] || 0);
  });
}

function renderDmTable() {
  const list = getDmList();
  const totalPages = Math.max(1, Math.ceil(list.length / DM_PG));
  if (S.dmPg > totalPages) S.dmPg = totalPages;
  const start = (S.dmPg - 1) * DM_PG;
  const slice = list.slice(start, start + DM_PG);
  const tbody = document.getElementById('dmTbody');
  const empty = document.getElementById('dmEmpty');
  const rc = document.getElementById('dmRc');
  const pb = document.getElementById('dmPb');
  if (!tbody || !empty || !rc || !pb) return;

  if (!slice.length) {
    tbody.innerHTML = '';
    empty.style.display = '';
    rc.textContent = '0 Treffer';
    pb.innerHTML = '';
    return;
  }
  empty.style.display = 'none';
  rc.textContent = list.length + ' Treffer';

  tbody.innerHTML = slice.map(function(lead, idx) {
    const rowCls = rowClassForLead(lead);
    return '<tr class="' + rowCls + '" onclick="openDmPanel(\'' + lead.id + '\')">' +
      '<td style="color:#B0A898;font-family:sans-serif;font-size:12px;text-align:right;padding-right:8px">' + (start + idx + 1) + '</td>' +
      '<td class="fc">' + esc(lead.name || '—') + '</td>' +
      '<td style="font-family:sans-serif;font-size:12px">' + esc(lead.firma || '—') + '</td>' +
      '<td style="font-family:sans-serif;font-size:12px">' + esc(lead.linkedin_name || '—') + '</td>' +
      '<td style="font-family:monospace;font-size:12px">' + esc(lead.telefon || '—') + '</td>' +
      '<td onclick="event.stopPropagation()">' + dmStatusSelectHtml(lead) + '</td>' +
      '<td onclick="event.stopPropagation()"><input type="date" class="fs2" data-id="' + lead.id + '" value="' + esc(lead.next_touch_date || '') + '" onchange="inlineDmDate(this)"></td>' +
      '<td style="font-family:sans-serif;font-size:12px">' + esc(lead.stadt || '—') + '</td>' +
      '<td style="font-family:sans-serif;font-size:12px">' + esc(lead.region || '—') + '</td>' +
      '<td onclick="event.stopPropagation()"><textarea class="inline-notiz" data-id="' + lead.id + '" onblur="saveDmNotiz(this)">' + esc(lead.notiz || '') + '</textarea></td>' +
      '<td onclick="event.stopPropagation()"><div class="ra" style="opacity:1">' +
        '<button class="btn bg bsm" onclick="openDmEdit(\'' + lead.id + '\')" title="Bearbeiten">✎</button>' +
        '<button class="btn bg bsm" onclick="delDm(\'' + lead.id + '\')" title="Löschen" style="color:var(--rd)">🗑</button>' +
      '</div></td>' +
    '</tr>';
  }).join('');

  let phtml = '';
  for (let p = 1; p <= totalPages; p++) {
    phtml += '<button class="pbb' + (p === S.dmPg ? ' on' : '') + '" onclick="goDmPg(' + p + ')">' + p + '</button>';
  }
  pb.innerHTML = phtml;
}

export async function loadDmLeads() {
  try {
    const rows = await sbGet(DM_VIEW_SB + '?select=*&order=next_touch_date.asc.nullslast,created_at.desc');
    S.dmLeads = Array.isArray(rows) ? rows : [];
    renderDm();
  } catch (e) {
    toast('DM Akquise laden fehlgeschlagen: ' + e.message);
  }
}

export function renderDm() {
  renderDmStats();
  const page = document.getElementById('page-dm-akquise');
  if (!page || !page.classList.contains('active')) return;
  renderDmTable();
}

export function setDmF(filter) {
  S.dmFlt = filter || 'all';
  S.dmPg = 1;
  document.querySelectorAll('[data-dm-filter]').forEach(function(el) {
    el.classList.toggle('on', el.getAttribute('data-dm-filter') === S.dmFlt);
  });
  renderDm();
}

export function goDmPg(page) {
  S.dmPg = page;
  renderDm();
}

export function scheduleDmRender() {
  S.dmPg = 1;
  renderDm();
}

function getLeadById(id) {
  return S.dmLeads.find(function(lead) { return lead.id === id; });
}

async function saveLeadRow(lead, keepCreated) {
  const row = buildDmRow(lead, keepCreated);
  await sbUpsert(DM_KEY_SB, [row]);
  return row;
}

export async function inlineDmStatus(sel) {
  const id = sel && sel.dataset ? sel.dataset.id : null;
  const lead = getLeadById(id);
  if (!lead) return;
  const before = normalizeDmStatus(lead.status);
  lead.status = normalizeDmStatus(sel.value);
  setDmStatusClass(sel);
  renderDm();
  try {
    await saveLeadRow(lead, true);
  } catch (e) {
    lead.status = before;
    setDmStatusClass(sel);
    renderDm();
    toast('Status speichern fehlgeschlagen: ' + e.message);
  }
}

export async function inlineDmDate(input) {
  const id = input && input.dataset ? input.dataset.id : null;
  const lead = getLeadById(id);
  if (!lead) return;
  const before = lead.next_touch_date || '';
  lead.next_touch_date = input.value || null;
  renderDm();
  try {
    await saveLeadRow(lead, true);
  } catch (e) {
    lead.next_touch_date = before || null;
    input.value = before;
    renderDm();
    toast('Datum speichern fehlgeschlagen: ' + e.message);
  }
}

export async function saveDmNotiz(el) {
  const id = el && el.dataset ? el.dataset.id : null;
  const lead = getLeadById(id);
  if (!lead) return;
  const before = lead.notiz || '';
  lead.notiz = el.value.trim() || null;
  try {
    await saveLeadRow(lead, true);
    el.classList.add('autosaved');
    setTimeout(function() { el.classList.remove('autosaved'); }, 900);
  } catch (e) {
    lead.notiz = before || null;
    el.value = before;
    toast('Notiz speichern fehlgeschlagen: ' + e.message);
  }
}

export function openDmAdd() {
  S.dmEid = null;
  document.getElementById('dmModalTitle').textContent = 'DM-Lead hinzufügen';
  ['dmName', 'dmFirma', 'dmLinkedinName', 'dmTel', 'dmLinkedinUrl', 'dmStadt', 'dmRegion', 'dmGewerk', 'dmNotiz'].forEach(function(id) {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  document.getElementById('dmStatus').value = 'erstkontakt';
  document.getElementById('dmNextTouch').value = '';
  setDmStatusClass(document.getElementById('dmStatus'));
  document.getElementById('dmModal').classList.add('on');
}

export function openDmEdit(id) {
  const lead = getLeadById(id);
  if (!lead) return;
  S.dmEid = id;
  document.getElementById('dmModalTitle').textContent = 'DM-Lead bearbeiten';
  document.getElementById('dmName').value = lead.name || '';
  document.getElementById('dmFirma').value = lead.firma || '';
  document.getElementById('dmLinkedinName').value = lead.linkedin_name || '';
  document.getElementById('dmTel').value = lead.telefon || '';
  document.getElementById('dmLinkedinUrl').value = lead.linkedin_url || '';
  document.getElementById('dmStadt').value = lead.stadt || '';
  document.getElementById('dmRegion').value = lead.region || '';
  document.getElementById('dmGewerk').value = lead.gewerk || '';
  document.getElementById('dmStatus').value = normalizeDmStatus(lead.status);
  document.getElementById('dmNextTouch').value = lead.next_touch_date || '';
  document.getElementById('dmNotiz').value = lead.notiz || '';
  setDmStatusClass(document.getElementById('dmStatus'));
  document.getElementById('dmModal').classList.add('on');
}

export function closeDmModal() {
  document.getElementById('dmModal').classList.remove('on');
}

export async function saveDm() {
  const name = document.getElementById('dmName').value.trim();
  if (!name) {
    toast('Name fehlt.');
    return;
  }
  const lead = {
    id: S.dmEid || undefined,
    name: name,
    firma: document.getElementById('dmFirma').value,
    linkedin_name: document.getElementById('dmLinkedinName').value,
    telefon: document.getElementById('dmTel').value,
    linkedin_url: document.getElementById('dmLinkedinUrl').value,
    stadt: document.getElementById('dmStadt').value,
    region: document.getElementById('dmRegion').value,
    gewerk: document.getElementById('dmGewerk').value,
    status: document.getElementById('dmStatus').value,
    next_touch_date: document.getElementById('dmNextTouch').value || null,
    notiz: document.getElementById('dmNotiz').value,
  };
  if (S.dmEid) {
    const old = getLeadById(S.dmEid);
    if (old && old.crm_contact_id) lead.crm_contact_id = old.crm_contact_id;
    if (old && old.created_at) lead.created_at = old.created_at;
    if (old && old.touch_stufe != null) lead.touch_stufe = old.touch_stufe;
  }
  try {
    await sbUpsert(DM_KEY_SB, [buildDmRow(lead, !!S.dmEid)]);
    closeDmModal();
    await loadDmLeads();
    toast(S.dmEid ? 'DM-Lead gespeichert.' : 'DM-Lead hinzugefügt.');
  } catch (e) {
    toast('Speichern fehlgeschlagen: ' + e.message);
  }
}

export async function delDm(id) {
  if (!confirm('DM-Lead wirklich löschen?')) return;
  try {
    await sbDelete(DM_KEY_SB + '?id=eq.' + encodeURIComponent(id));
    S.dmLeads = S.dmLeads.filter(function(lead) { return lead.id !== id; });
    renderDm();
    closeDmPanel();
    toast('DM-Lead gelöscht.');
  } catch (e) {
    toast('Löschen fehlgeschlagen: ' + e.message);
  }
}

export function openDmPanel(id) {
  const lead = getLeadById(id);
  if (!lead) return;
  const st = DM_STATUS[normalizeDmStatus(lead.status)] || DM_STATUS.erstkontakt;
  document.getElementById('dmPFirma').textContent = lead.name || '—';
  document.getElementById('dmPSub').textContent = [lead.firma, lead.linkedin_name].filter(Boolean).join(' · ') || '—';
  const dup = lead.is_duplicate ? '<span class="badge b-dm-dup">Cross-Channel-Duplikat</span>' : '<span class="badge b-dm-clear">Kein Duplikat</span>';
  document.getElementById('dmPBody').innerHTML =
    '<div style="margin-bottom:10px">' + dup + '</div>' +
    ir('Status', '<span class="badge ' + st.cls + '">' + st.label + '</span>') +
    ir('Nächster Touch', fdc(lead.next_touch_date)) +
    ir('Firma', esc(lead.firma || '—')) +
    ir('LinkedIn Name', esc(lead.linkedin_name || '—')) +
    ir('Telefon', lead.telefon ? '<a href="tel:' + esc(lead.telefon) + '">' + esc(lead.telefon) + '</a>' : '—') +
    ir('Stadt', esc(lead.stadt || '—')) +
    ir('Region', esc(lead.region || '—')) +
    ir('Notiz', esc(lead.notiz || '—'));

  document.getElementById('dmPFoot').innerHTML =
    '<button class="btn bp bsm" onclick="openDmEdit(\'' + escJs(id) + '\');closeDmPanel()">✎ Bearbeiten</button>' +
    '<button class="btn bs bsm" onclick="delDm(\'' + escJs(id) + '\');closeDmPanel()" style="color:var(--rd)">🗑 Löschen</button>';
  document.getElementById('dmPo').classList.add('on');
}

export function closeDmPanel() {
  document.getElementById('dmPo').classList.remove('on');
}

window.addEventListener('rais:page-change', function(e) {
  if (e.detail.page === 'dm-akquise') loadDmLeads();
});
