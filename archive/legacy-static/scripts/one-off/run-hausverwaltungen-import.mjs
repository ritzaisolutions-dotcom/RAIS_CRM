import { readFileSync } from 'fs';

const SB_URL = 'https://qdywaenmojdxhfxqbvun.supabase.co';
const SB_KEY = process.env.SB_KEY || ''; // REDAKTIERT 2026-08-20: produktiver anon-Key war hier hartkodiert.
if (!SB_KEY) { console.error('SB_KEY fehlt. Dieses Archiv-Skript schreibt in die PRODUKTION — Key bewusst per Umgebung setzen.'); process.exit(1); }

const rows = JSON.parse(readFileSync('scripts/hausverwaltungen-import.json', 'utf8'));
const existing = await fetch(
  SB_URL + '/rest/v1/crm_contacts?select=firma&limit=10000',
  { headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY } }
).then((r) => r.json());

const existingSet = new Set((existing || []).map((c) => (c.firma || '').toLowerCase().trim()));
const toInsert = rows.filter((r) => !existingSet.has(r.firma.toLowerCase().trim()));

let added = 0;
let failed = 0;
for (const row of toInsert) {
  const res = await fetch(SB_URL + '/rest/v1/crm_contacts', {
    method: 'POST',
    headers: {
      apikey: SB_KEY,
      Authorization: 'Bearer ' + SB_KEY,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify(row),
  });
  if (res.ok) added++;
  else {
    failed++;
    const err = await res.text();
    if (failed <= 3) console.error('FAIL', row.firma, err.slice(0, 200));
  }
}

console.log(JSON.stringify({
  total: rows.length,
  skipped: rows.length - toInsert.length,
  added,
  failed,
}));
