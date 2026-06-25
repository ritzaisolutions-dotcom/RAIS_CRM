import { S } from './state.js';
import { gid, td, normalizeWebsite, normalizeGewerk, syncLeadTemp, normalizeContactStatus } from './utils.js';
import { persist } from './sync.js';
import { toast } from './ui.js';

export function openImport() {
  S.ibuf = [];
  document.getElementById('ip').innerHTML = '';
  document.getElementById('ib').style.display = 'none';
  document.getElementById('cf').value = '';
  document.getElementById('io').classList.add('on');
}

export function closeI() { document.getElementById('io').classList.remove('on'); }
export function dzOv(e)  { e.preventDefault(); document.getElementById('dz').classList.add('drag'); }
export function dzLv()   { document.getElementById('dz').classList.remove('drag'); }
export function dzDr(e)  { e.preventDefault(); dzLv(); rdFile(e.dataTransfer.files[0]); }
export function rdCSV(e) { rdFile(e.target.files[0]); }

function rdFile(f) {
  if (!f) return;
  const r = new FileReader();
  r.onload = function(e) { parseCSV(e.target.result); };
  r.readAsText(f, 'UTF-8');
}

function spl(l) {
  const r = []; let c = '', q = false;
  for (let i = 0; i < l.length; i++) {
    const ch = l[i];
    if (ch === '"') { q = !q; continue; }
    if ((ch === ',' || ch === ';') && !q) { r.push(c); c = ''; continue; }
    c += ch;
  }
  r.push(c); return r;
}

function normHead(h) {
  return String(h || '').trim().toLowerCase().replace(/^\ufeff/, '').replace(/\s+/g, ' ');
}

/** Exact header match first, then substring (e.g. Unternehmen → firma). */
function colIndex(heads, aliases) {
  let i;
  for (i = 0; i < aliases.length; i++) {
    const idx = heads.findIndex(function(h) { return h === aliases[i]; });
    if (idx >= 0) return idx;
  }
  for (i = 0; i < aliases.length; i++) {
    const idx = heads.findIndex(function(h) { return h.includes(aliases[i]); });
    if (idx >= 0) return idx;
  }
  return -1;
}

function parseCSV(txt) {
  const lines = txt.replace(/^\ufeff/, '').replace(/\r/g, '').split('\n').filter(function(l) { return l.trim(); });
  if (lines.length < 2) { toast('CSV leer.'); return; }
  const heads = spl(lines[0]).map(normHead);
  const iF   = colIndex(heads, ['unternehmen', 'firma', 'firmenname', 'company_name', 'company']);
  const iK   = colIndex(heads, ['ansprechpartner', 'kontakt', 'person_name', 'name']);
  const iT   = colIndex(heads, ['telefon', 'phone', 'tel']);
  const iS   = colIndex(heads, ['status']);
  const iFu  = colIndex(heads, ['follow-up', 'followup', 'follow']);
  const iSt  = colIndex(heads, ['stadt', 'city', 'adresse', 'ort']);
  const iReg = colIndex(heads, ['region', 'bundesland']);
  const iEm  = colIndex(heads, ['email', 'e-mail']);
  const iWeb = colIndex(heads, ['website', 'webseite', 'web']);
  const iHl  = colIndex(heads, ['hauptleistung']);
  const iBes = colIndex(heads, ['besonderheit']);
  const iTit = colIndex(heads, ['title', 'titel']);
  const iGew = colIndex(heads, ['gewerk']);
  const iMa  = colIndex(heads, ['ma', 'mitarbeiter', 'mitarbeiterzahl', 'mitarbeiter_anzahl', 'employees']);
  const iObj = colIndex(heads, ['objekte', 'verwaltete objekte', 'objekte_bestand', 'bestand', 'einheiten']);
  const iRoi = colIndex(heads, ['prio', 'priorität', 'priority', 'roi']);
  if (iF < 0) {
    toast('Keine Firma-Spalte (Unternehmen/Firma). Gefunden: ' + heads.join(', '));
    return;
  }
  const sm2 = {
    'neu': 'neu',
    'callback': 'callback', 'rückruf': 'callback', 'followup': 'callback', 'follow-up': 'callback',
    'set_appointment': 'set_appointment', 'demo_termin': 'set_appointment', 'termin': 'set_appointment',
    'demo': 'set_appointment', 'interessiert': 'set_appointment', 'door_open': 'set_appointment',
    'closed': 'closed', 'gewonnen': 'closed',
    'kein_anschluss': 'kein_anschluss', 'nicht erreicht': 'kein_anschluss', 'nicht_erreicht': 'kein_anschluss',
    'kein_anschluss_2': 'kein_anschluss', 'kein anschluss 2': 'kein_anschluss', 'ka2': 'kein_anschluss',
    'no show': 'kein_anschluss', 'no_show': 'kein_anschluss', 'email_nurture': 'kein_anschluss',
    'nicht_interessiert': 'disqualified', 'kein interesse': 'disqualified', 'kein_interesse': 'disqualified',
    'disqualified': 'disqualified', 'nicht passend': 'disqualified', 'nicht_passend': 'disqualified',
    'aussortiert': 'disqualified', 'archiviert': 'disqualified',
    'ghost': 'mofo', 'mofo': 'mofo',
    'gatekeeper': 'gatekeeper',
    'vernetzt': 'vernetzt', 'linkedin dm': 'vernetzt', 'linkedin_dm': 'vernetzt',
  };
  // Strip Excel-quoting artifact (leading apostrophe) and "NA" placeholder
  const clean = function(v) { return (v === 'NA' || v === 'na') ? '' : v; };
  const cleanPhone = function(v) { return v.replace(/^['‘’\s]+/, '').trim(); };
  S.ibuf = lines.slice(1).map(function(l) {
    const c = spl(l);
    const g = function(i) { return i >= 0 ? clean((c[i] || '').trim()) : ''; };
    const rs = g(iS).toLowerCase();
    return {
      id: gid(), created: Date.now(),
      firma: g(iF),
      kontakt: g(iK),
      title: g(iTit),
      telefon: cleanPhone(g(iT)),
      email: g(iEm),
      website: normalizeWebsite(g(iWeb)),
      status: normalizeContactStatus(sm2[rs] || 'neu'),
      followup: g(iFu),
      stadt: g(iSt),
      region: g(iReg),
      hauptleistung: g(iHl),
      besonderheit: g(iBes),
      gewerk: normalizeGewerk(g(iGew)),
      mitarbeiter_anzahl: iMa >= 0 ? (parseInt(g(iMa), 10) || null) : null,
      objekte_bestand: iObj >= 0 ? (parseInt(g(iObj), 10) || null) : null,
      roi: iRoi >= 0 ? (parseInt(g(iRoi), 10) || 1) : 1,
      touches: [{status:'', datum:'', notiz:''}]
    };
  }).filter(function(c) { return c.firma; });
  document.getElementById('ip').innerHTML =
    '<div style="font-family:sans-serif;font-size:13px;color:#789464;font-weight:600">' +
    '&#10003; ' + S.ibuf.length + ' Kontakte erkannt</div>';
  document.getElementById('ib').style.display = 'inline-flex';
}

export function doImport() {
  if (!S.ibuf.length) return;
  let added = 0, skipped = 0;
  S.ibuf.forEach(function(c) {
    const dup = S.contacts.find(function(x) {
      const samePhone = c.telefon && x.telefon && c.telefon.replace(/\s/g,'') === x.telefon.replace(/\s/g,'');
      const sameFirma = c.firma.toLowerCase().trim() === (x.firma||'').toLowerCase().trim();
      return samePhone || sameFirma;
    });
    if (dup) { skipped++; return; }
    c.lead_origin = 'import';
    c.lead_temp = 'cold';
    c.socials = {};
    syncLeadTemp(c);
    S.contacts.push(c);
    added++;
  });
  persist(); closeI(); render();
  toast(added + ' importiert' + (skipped ? ', ' + skipped + ' Duplikate übersprungen.' : '.'));
  S.ibuf = [];
}

export function exportCSV() {
  const h = ['Firma','Kontakt','Titel','Telefon','Email','Website','ROI','Status','Follow-up','Letzter Anruf','Reviews','Leistung','Besonderheit'];
  const rows = S.contacts.map(function(c) {
    const lastTouch = (c.touches && c.touches.length)
      ? (c.touches[c.touches.length - 1].datum || '') + ' ' + (c.touches[c.touches.length - 1].status || '')
      : '';
    return [c.firma,c.kontakt,c.title,c.telefon,c.email,c.website,c.roi,c.status,c.followup,lastTouch,c.reviews,c.hauptleistung,c.besonderheit]
      .map(function(v) { return '"' + String(v || '').replace(/"/g, '""') + '"'; });
  });
  const csv = [h.join(',')].concat(rows.map(function(r) { return r.join(','); })).join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['﻿' + csv], {type: 'text/csv;charset=utf-8'}));
  a.download = 'RAIS_CRM_' + td() + '.csv';
  a.click();
  toast('Export gestartet.');
}
