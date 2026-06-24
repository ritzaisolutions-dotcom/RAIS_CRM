import { S, NW_KEY_SB, LEBENSBEREICHE } from './state.js';
import { sbGet, sbUpsert, sbDelete } from './supabase.js';
import { esc, toast, ir, socialIconsHtml } from './ui.js';
import { td, normalizeWebsite, getSocials } from './utils.js';

let _inited = false;

window.addEventListener('rais:page-change', function(e) {
  if (e.detail.page === 'network') initNetworkPage();
});

export function initNetworkPage() {
  if (!_inited) {
    _inited = true;
    fillLbSelect('nwLbF');
    fillLbSelect('nwLb');
  }
  loadNetwork();
}

function fillLbSelect(id) {
  const sel = document.getElementById(id);
  if (!sel) return;
  const cur = sel.value;
  const list = S.lebensbereiche.length ? S.lebensbereiche : LEBENSBEREICHE;
  sel.innerHTML = '<option value="">' + (id === 'nwLbF' ? 'Lebensbereich: Alle' : '— keiner —') + '</option>' +
    list.map(function(l) {
      return '<option value="' + esc(l) + '"' + (l === cur ? ' selected' : '') + '>' + esc(l) + '</option>';
    }).join('');
}

export async function loadNetwork() {
  try {
    const rows = await sbGet(NW_KEY_SB + '?select=*&order=created.desc');
    S.network = rows || [];
    renderNetwork();
  } catch (e) {
    toast('Netzwerk laden fehlgeschlagen: ' + e.message);
  }
}

export function renderNetwork() {
  const srch = (document.getElementById('nwSrch') || { value: '' }).value.toLowerCase();
  const lbF = (document.getElementById('nwLbF') || { value: '' }).value;
  const list = S.network.filter(function(c) {
    if (lbF && c.lebensbereich !== lbF) return false;
    if (srch) {
      const hay = [c.name, c.firma, c.rolle, c.gewerk, c.met_where, c.notiz, c.stadt].join(' ').toLowerCase();
      if (!hay.includes(srch)) return false;
    }
    return true;
  });
  const tbody = document.getElementById('nwTbody');
  const empty = document.getElementById('nwEmpty');
  if (!list.length) {
    if (tbody) tbody.innerHTML = '';
    if (empty) empty.style.display = '';
    return;
  }
  if (empty) empty.style.display = 'none';
  tbody.innerHTML = list.map(function(c, i) {
    const met = c.met_at ? esc(c.met_at) + (c.met_where ? ' · ' + esc(c.met_where) : '') : (c.met_where ? esc(c.met_where) : '—');
    return '<tr onclick="openNwPanel(\'' + c.id + '\')" style="cursor:pointer">' +
      '<td style="color:#B0A898;font-family:sans-serif;font-size:12px;text-align:right;padding-right:8px">' + (i + 1) + '</td>' +
      '<td class="fc">' + esc(c.name) + '</td>' +
      '<td>' + esc(c.firma || '—') + '</td>' +
      '<td>' + esc(c.lebensbereich || '—') + '</td>' +
      '<td onclick="event.stopPropagation()">' + socialIconsHtml(getSocials(c)) + '</td>' +
      '<td style="font-family:sans-serif;font-size:12px;color:var(--st)">' + met + '</td>' +
      '<td onclick="event.stopPropagation()"><div class="ra" style="opacity:1">' +
        '<button class="btn bg bsm" onclick="openNwEdit(\'' + c.id + '\')" title="Bearbeiten">✎</button>' +
        '<button class="btn bg bsm" onclick="delNw(\'' + c.id + '\')" title="Löschen" style="color:var(--rd)">🗑</button>' +
      '</div></td>' +
    '</tr>';
  }).join('');
}

export function openNwAdd() {
  S.nwEid = null;
  document.getElementById('nwModalTitle').textContent = 'Kontakt hinzufügen';
  ['nwName','nwFirma','nwRolle','nwTel','nwEmail','nwGewerk','nwMetWhere','nwStadt','nwPlz','nwStr','nwNotiz'].forEach(function(id) {
    const el = document.getElementById(id); if (el) el.value = '';
  });
  ['nwLi','nwIg','nwX','nwFb','nwWa'].forEach(function(id) {
    const el = document.getElementById(id); if (el) el.value = '';
  });
  document.getElementById('nwLb').value = '';
  document.getElementById('nwMetAt').value = td();
  document.getElementById('networkModal').classList.add('on');
}

export function openNwEdit(id) {
  const c = S.network.find(function(x) { return x.id === id; });
  if (!c) return;
  S.nwEid = id;
  document.getElementById('nwModalTitle').textContent = 'Kontakt bearbeiten';
  document.getElementById('nwName').value = c.name || '';
  document.getElementById('nwFirma').value = c.firma || '';
  document.getElementById('nwRolle').value = c.rolle || '';
  document.getElementById('nwLb').value = c.lebensbereich || '';
  document.getElementById('nwGewerk').value = c.gewerk || '';
  document.getElementById('nwTel').value = c.telefon || '';
  document.getElementById('nwEmail').value = c.email || '';
  document.getElementById('nwMetAt').value = c.met_at || '';
  document.getElementById('nwMetWhere').value = c.met_where || '';
  document.getElementById('nwStadt').value = c.stadt || '';
  document.getElementById('nwPlz').value = c.plz || '';
  document.getElementById('nwStr').value = c.strasse || '';
  document.getElementById('nwNotiz').value = c.notiz || '';
  const s = getSocials(c);
  document.getElementById('nwLi').value = s.linkedin || '';
  document.getElementById('nwIg').value = s.instagram || '';
  document.getElementById('nwX').value = s.x || '';
  document.getElementById('nwFb').value = s.facebook || '';
  document.getElementById('nwWa').value = s.whatsapp || '';
  document.getElementById('networkModal').classList.add('on');
}

export function closeNwModal() { document.getElementById('networkModal').classList.remove('on'); }

export async function saveNw() {
  const name = document.getElementById('nwName').value.trim();
  if (!name) { toast('Name fehlt.'); return; }
  const now = new Date().toISOString();
  const row = {
    name: name,
    firma: document.getElementById('nwFirma').value.trim() || null,
    rolle: document.getElementById('nwRolle').value.trim() || null,
    lebensbereich: document.getElementById('nwLb').value || null,
    gewerk: document.getElementById('nwGewerk').value.trim() || null,
    telefon: document.getElementById('nwTel').value.trim() || null,
    email: document.getElementById('nwEmail').value.trim() || null,
    met_at: document.getElementById('nwMetAt').value || null,
    met_where: document.getElementById('nwMetWhere').value.trim() || null,
    stadt: document.getElementById('nwStadt').value.trim() || null,
    plz: document.getElementById('nwPlz').value.trim() || null,
    strasse: document.getElementById('nwStr').value.trim() || null,
    notiz: document.getElementById('nwNotiz').value.trim() || null,
    socials: {
      linkedin: document.getElementById('nwLi').value.trim() || null,
      instagram: document.getElementById('nwIg').value.trim() || null,
      x: document.getElementById('nwX').value.trim() || null,
      facebook: document.getElementById('nwFb').value.trim() || null,
      whatsapp: document.getElementById('nwWa').value.trim() || null,
    },
    synced_at: now,
  };
  if (S.nwEid) row.id = S.nwEid;
  try {
    await sbUpsert(NW_KEY_SB, [row]);
    await loadNetwork();
    closeNwModal();
    toast(S.nwEid ? 'Kontakt gespeichert.' : 'Kontakt hinzugefügt.');
  } catch (e) {
    toast('Fehler: ' + e.message);
  }
}

export async function delNw(id) {
  if (!confirm('Kontakt wirklich löschen?')) return;
  try {
    await sbDelete(NW_KEY_SB + '?id=eq.' + id);
    S.network = S.network.filter(function(c) { return c.id !== id; });
    renderNetwork();
    closeNwPanel();
    toast('Kontakt gelöscht.');
  } catch (e) { toast('Fehler: ' + e.message); }
}

export function openNwPanel(id) {
  const c = S.network.find(function(x) { return x.id === id; });
  if (!c) return;
  document.getElementById('nwPFirma').textContent = c.name;
  document.getElementById('nwPSub').textContent = [c.firma, c.rolle].filter(Boolean).join(' · ');
  const s = getSocials(c);
  const soc = socialIconsHtml(s, true);
  document.getElementById('nwPBody').innerHTML =
    '<div class="sh">Kontakt</div>' +
    ir('Telefon', c.telefon ? '<a href="tel:' + esc(c.telefon) + '">' + esc(c.telefon) + '</a>' : '—') +
    ir('E-Mail', c.email ? '<a href="mailto:' + esc(c.email) + '">' + esc(c.email) + '</a>' : '—') +
    (soc ? '<div class="sh">Social</div>' + soc : '') +
    '<div class="sh">Kennengelernt</div>' +
    ir('Datum', esc(c.met_at || '—')) +
    ir('Ort / Event', esc(c.met_where || '—')) +
    '<div class="sh">Adresse</div>' +
    ir('Straße', esc(c.strasse || '—')) +
    ir('PLZ / Stadt', esc([c.plz, c.stadt].filter(Boolean).join(' ') || '—')) +
    ir('Lebensbereich', esc(c.lebensbereich || '—')) +
    ir('Gewerk', esc(c.gewerk || '—')) +
    (c.notiz ? '<div class="sh">Notiz</div><p style="font-size:13px;color:var(--st);white-space:pre-wrap">' + esc(c.notiz) + '</p>' : '');
  document.getElementById('nwPFoot').innerHTML =
    '<button class="btn bp bsm" onclick="openNwEdit(\'' + id + '\');closeNwPanel()">✎ Bearbeiten</button>' +
    '<button class="btn bs bsm" onclick="delNw(\'' + id + '\');closeNwPanel()" style="color:var(--rd)">🗑 Löschen</button>';
  document.getElementById('nwPo').classList.add('on');
}

export function closeNwPanel() { document.getElementById('nwPo').classList.remove('on'); }
