import { S } from './state.js';
import { gid, td } from './utils.js';
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

function parseCSV(txt) {
  const lines = txt.replace(/\r/g, '').split('\n').filter(function(l) { return l.trim(); });
  if (lines.length < 2) { toast('CSV leer.'); return; }
  const heads = spl(lines[0]).map(function(h) { return h.trim().toLowerCase(); });
  // Match first column whose header contains any of the given substrings
  const ci = function() {
    const names = Array.prototype.slice.call(arguments);
    for (let n = 0; n < names.length; n++) {
      const idx = heads.findIndex(function(h) { return h.includes(names[n]); });
      if (idx >= 0) return idx;
    }
    return -1;
  };
  const iF   = ci('firma', 'company_name', 'company');
  const iK   = ci('ansprechpartner', 'person_name', 'kontakt');
  const iT   = ci('telefon', 'phone', 'tel');
  const iS   = ci('status');
  const iFu  = ci('follow');
  const iSt  = ci('stadt', 'city');
  const iReg = ci('region');
  const iEm  = ci('email');
  const iWeb = ci('webseite', 'website', 'web');
  const iHl  = ci('hauptleistung');
  const iBes = ci('besonderheit');
  const iTit = ci('title', 'titel');
  const iGew = ci('gewerk');
  const iRoi = ci('roi');
  if (iF < 0) { toast('Keine Firma-Spalte gefunden.'); return; }
  const sm2 = {
    'neu': 'neu',
    'callback': 'callback', 'rückruf': 'callback',
    'demo_termin': 'demo_termin', 'termin': 'demo_termin',
    'email_nurture': 'email_nurture', 'nurture': 'email_nurture', 'interessiert': 'email_nurture',
    'kein_anschluss': 'kein_anschluss', 'nicht erreicht': 'kein_anschluss', 'nicht_erreicht': 'kein_anschluss', 'no show': 'kein_anschluss',
    'kein_anschluss_2': 'kein_anschluss_2', 'kein anschluss 2': 'kein_anschluss_2', 'ka2': 'kein_anschluss_2',
    'nicht_interessiert': 'disqualified', 'kein interesse': 'disqualified', 'kein_interesse': 'disqualified', 'disqualified': 'disqualified',
    'nicht passend': 'nicht_passend', 'nicht_passend': 'nicht_passend', 'kein fit': 'nicht_passend', 'aussortiert': 'nicht_passend',
    'ghost': 'ghost',
    'gatekeeper': 'gatekeeper',
    'followup': 'callback', 'follow-up': 'callback',
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
      website: g(iWeb),
      status: sm2[rs] || 'neu',
      followup: g(iFu),
      stadt: g(iSt),
      region: g(iReg),
      hauptleistung: g(iHl),
      besonderheit: g(iBes),
      gewerk: g(iGew),
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
