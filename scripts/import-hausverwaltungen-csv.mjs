/**
 * Parse hausverwaltungen_rlp_prospektliste.csv → JSON rows for crm_contacts.
 * Usage: node scripts/import-hausverwaltungen-csv.mjs
 */
import { readFileSync, writeFileSync } from 'fs';
import { randomUUID } from 'crypto';

const CSV = 'hausverwaltungen_rlp_prospektliste.csv';

function spl(line) {
  const r = [];
  let c = '';
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { q = !q; continue; }
    if ((ch === ',' || ch === ';') && !q) { r.push(c); c = ''; continue; }
    c += ch;
  }
  r.push(c);
  return r;
}

function normalizeWebsite(url) {
  const u = (url || '').trim();
  if (!u) return '';
  if (/^https?:\/\//i.test(u)) return u;
  return 'https://' + u;
}

function parseAdresse(adresse) {
  const a = (adresse || '').trim();
  if (!a) return { stadt: '', plz: '', strasse: '' };
  const m = a.match(/(\d{5})\s+([^,]+)/);
  if (m) {
    return {
      plz: m[1],
      stadt: m[2].trim(),
      strasse: a.replace(m[0], '').replace(/^[,\s-]+|[,\s-]+$/g, '').trim(),
    };
  }
  return { stadt: a, plz: '', strasse: '' };
}

function cleanPhone(v) {
  const t = (v || '').trim();
  if (!t || /^per\s+website$/i.test(t)) return '';
  return t.replace(/^['‘’\s]+/, '').trim();
}

const txt = readFileSync(CSV, 'utf8');
const lines = txt.replace(/\r/g, '').split('\n').filter((l) => l.trim());
const heads = spl(lines[0]).map((h) => h.trim().toLowerCase());
const idx = (name) => heads.indexOf(name);

const now = Date.now();
const rows = lines.slice(1).map((line) => {
  const c = spl(line);
  const g = (i) => (i >= 0 ? (c[i] || '').trim() : '');
  const adresse = g(idx('adresse'));
  const addr = parseAdresse(adresse);
  const prio = parseInt(g(idx('prio')), 10) || 1;
  return {
    id: randomUUID(),
    created: now,
    firma: g(idx('unternehmen')),
    kontakt: g(idx('name')),
    email: g(idx('email')),
    website: normalizeWebsite(g(idx('website'))),
    telefon: cleanPhone(g(idx('telefon'))),
    stadt: addr.stadt || adresse,
    plz: addr.plz || null,
    strasse: addr.strasse || null,
    region: 'RLP',
    gewerk: 'Hausverwaltung',
    roi: prio,
    status: 'neu',
    source: 'hausverwaltungen_rlp_prospektliste',
    notiz: adresse && addr.stadt !== adresse ? adresse : null,
    touches: [{ status: '', datum: '', notiz: '' }],
    synced_at: new Date().toISOString(),
  };
}).filter((r) => r.firma);

writeFileSync('scripts/hausverwaltungen-import.json', JSON.stringify(rows, null, 2));
console.log('Parsed', rows.length, 'contacts → scripts/hausverwaltungen-import.json');
