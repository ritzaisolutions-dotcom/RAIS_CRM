import { S, CL_KEY_SB, MEDIUM_ICONS } from './state.js';
import { sbGet, sbUpsert, sbDelete } from './supabase.js';
import { esc, toast, ir } from './ui.js';
import { td } from './utils.js';

window.addEventListener('rais:page-change', function(e) {
  if (e.detail.page === 'clients') loadClients();
});

export async function loadClients() {
  try {
    const rows = await sbGet(CL_KEY_SB + '?select=*&order=created.asc');
    S.clClients = rows || [];
    renderClients();
  } catch(e) {
    toast('Clients laden fehlgeschlagen: ' + e.message);
  }
}

export function renderClients() {
  const srch  = (document.getElementById('clSrch')  || {value:''}).value.toLowerCase();
  let list = S.clClients.filter(function(c) {
    if (srch) {
      const hay = [c.firma, c.kontakt, c.email, c.telefon, c.naechste_action].join(' ').toLowerCase();
      if (!hay.includes(srch)) return false;
    }
    return true;
  });
  const tbody = document.getElementById('clTbody');
  const empty = document.getElementById('clEmpty');
  if (!list.length) { tbody.innerHTML = ''; empty.style.display = ''; return; }
  empty.style.display = 'none';
  tbody.innerHTML = list.map(function(c, i) {
    const mIcon  = MEDIUM_ICONS[c.kontakt_medium] || '💬';
    const fd = c.naechste_datum;
    const fdCls = fd && fd <= td() ? 'fdov' : 'fdup';
    return '<tr onclick="openClPanel(\'' + c.id + '\')" style="cursor:pointer">' +
      '<td style="color:#B0A898;font-family:sans-serif;font-size:12px;text-align:right;padding-right:8px">' + (i+1) + '</td>' +
      '<td class="fc">' + esc(c.firma) + '</td>' +
      '<td style="font-family:sans-serif;font-size:12px;color:var(--st)">' + esc(c.kontakt||'—') + '</td>' +
      '<td style="font-size:16px" title="' + esc(c.kontakt_medium||'') + '">' + mIcon + '</td>' +
      '<td style="font-family:monospace;font-size:12px">' + esc(c.telefon||'—') + '</td>' +
      '<td style="font-family:sans-serif;font-size:12px">' + esc(c.email||'—') + '</td>' +
      '<td class="cl-scope">' + esc(c.naechste_action||'—') + '</td>' +
      '<td class="fd ' + fdCls + '" style="font-family:sans-serif;font-size:12px">' + esc(fd||'—') + '</td>' +
      '<td onclick="event.stopPropagation()"><div class="ra" style="opacity:1">' +
        '<button class="btn bg bsm" onclick="openClientEdit(\'' + c.id + '\')" title="Bearbeiten">✎</button>' +
        '<button class="btn bg bsm" onclick="delClient(\'' + c.id + '\')" title="Löschen" style="color:var(--rd)">🗑</button>' +
      '</div></td>' +
      '</tr>';
  }).join('');
}

export function openClientAdd() {
  S.clEid = null;
  document.getElementById('clModalTitle').textContent = 'Client hinzufügen';
  ['clFirma','clKontakt','clTelefon','clEmail','clAction'].forEach(function(id) {
    const el = document.getElementById(id); if (el) el.value = '';
  });
  document.getElementById('clMedium').value = 'email';
  document.getElementById('clDatum').value = '';
  document.getElementById('clientModal').classList.add('on');
}

export function openClientEdit(id) {
  const c = S.clClients.find(function(x) { return x.id === id; });
  if (!c) return;
  S.clEid = id;
  document.getElementById('clModalTitle').textContent = 'Client bearbeiten';
  document.getElementById('clFirma').value  = c.firma        || '';
  document.getElementById('clKontakt').value= c.kontakt      || '';
  document.getElementById('clTelefon').value= c.telefon      || '';
  document.getElementById('clEmail').value  = c.email        || '';
  document.getElementById('clMedium').value = c.kontakt_medium|| 'email';
  document.getElementById('clDatum').value  = c.naechste_datum|| '';
  document.getElementById('clAction').value = c.naechste_action|| '';
  document.getElementById('clientModal').classList.add('on');
}

export function closeClientModal() { document.getElementById('clientModal').classList.remove('on'); }

export async function saveClient() {
  const firma = document.getElementById('clFirma').value.trim();
  if (!firma) { toast('Firma fehlt.'); return; }
  const medium = document.getElementById('clMedium').value;
  if (!['email', 'telegram', 'whatsapp'].includes(medium)) {
    toast('Medium: E-Mail, Telegram oder WhatsApp wählen.');
    return;
  }
  const now = new Date().toISOString();
  const row = {
    firma:           firma,
    kontakt:         document.getElementById('clKontakt').value.trim() || null,
    telefon:         document.getElementById('clTelefon').value.trim() || null,
    email:           document.getElementById('clEmail').value.trim()   || null,
    kontakt_medium:  medium,
    naechste_datum:  document.getElementById('clDatum').value  || null,
    naechste_action: document.getElementById('clAction').value.trim() || null,
    synced_at:       now,
  };
  if (S.clEid) row.id = S.clEid;
  try {
    await sbUpsert(CL_KEY_SB, [row]);
    await loadClients();
    closeClientModal();
    toast(S.clEid ? 'Client gespeichert.' : 'Client hinzugefügt.');
  } catch(e) {
    toast('Fehler: ' + e.message);
  }
}

export async function delClient(id) {
  if (!confirm('Client wirklich löschen?')) return;
  try {
    await sbDelete(CL_KEY_SB + '?id=eq.' + id);
    S.clClients = S.clClients.filter(function(c) { return c.id !== id; });
    renderClients();
    toast('Client gelöscht.');
  } catch(e) { toast('Fehler: ' + e.message); }
}

export function openClPanel(id) {
  const c = S.clClients.find(function(x) { return x.id === id; });
  if (!c) return;
  document.getElementById('clPFirma').textContent = c.firma;
  document.getElementById('clPSub').textContent   = [MEDIUM_ICONS[c.kontakt_medium], c.kontakt].filter(Boolean).join(' ');
  const b = document.getElementById('clPBody');
  b.innerHTML =
    '<div class="sh">Kontakt</div>' +
    ir('Telefon',  c.telefon ? '<a href="tel:' + esc(c.telefon) + '">' + esc(c.telefon) + '</a>' : '—') +
    ir('E-Mail',    c.email   ? '<a href="mailto:' + esc(c.email) + '">' + esc(c.email) + '</a>' : '—') +
    ir('Medium',   (MEDIUM_ICONS[c.kontakt_medium]||'') + ' ' + esc(c.kontakt_medium||'—')) +
    '<div class="sh">Nächste Aktion</div>' +
    ir('Aktion',   esc(c.naechste_action||'—') + (c.naechste_datum ? ' <span style="color:var(--st);font-size:11px">(' + c.naechste_datum + ')</span>' : ''));
  document.getElementById('clPFoot').innerHTML =
    '<button class="btn bp bsm" onclick="openClientEdit(\'' + id + '\');closeClPanel()">✎ Bearbeiten</button>' +
    '<button class="btn bs bsm" onclick="delClient(\'' + id + '\');closeClPanel()" style="color:var(--rd)">🗑 Löschen</button>';
  document.getElementById('clPo').classList.add('on');
}

export function closeClPanel() { document.getElementById('clPo').classList.remove('on'); }

export async function promptAutoClient(contact, status) {
  if (status !== 'gewonnen' && status !== 'demo_termin') return;
  const already = S.clClients.find(function(c) {
    return c.firma && contact.firma && c.firma.toLowerCase() === contact.firma.toLowerCase();
  });
  if (already) return;
  if (status === 'gewonnen') {
    if (!confirm('„' + (contact.firma || 'Kontakt') + '“ als Client anlegen?')) return;
    openClientAddPrefill(contact);
    return;
  }
  const row = {
    firma:           contact.firma || '',
    kontakt:         contact.kontakt || null,
    telefon:         contact.telefon || null,
    email:           contact.email   || null,
    kontakt_medium:  'email',
    naechste_action: 'Sales Call vorbereiten',
    synced_at:       new Date().toISOString(),
  };
  try {
    await sbUpsert(CL_KEY_SB, [row]);
    await loadClients();
    toast('&#9989; ' + (contact.firma || 'Kontakt') + ' in Clients eingetragen.');
  } catch(e) {
    toast('Clients-Eintrag fehlgeschlagen: ' + e.message);
  }
}

export function openClientAddPrefill(contact) {
  openClientAdd();
  document.getElementById('clFirma').value = contact.firma || '';
  document.getElementById('clKontakt').value = contact.kontakt || '';
  document.getElementById('clTelefon').value = contact.telefon || '';
  document.getElementById('clEmail').value = contact.email || '';
  document.getElementById('clMedium').value = 'email';
  document.getElementById('clAction').value = 'Onboarding starten';
}
