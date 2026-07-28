import { readFileSync, writeFileSync } from 'fs';

const rows = JSON.parse(readFileSync('scripts/hausverwaltungen-import.json', 'utf8'));

function mkSql(batch, suffix) {
  const payload = JSON.stringify(batch).replace(/'/g, "''");
  return `INSERT INTO crm_contacts (
  id, created, firma, kontakt, email, website, telefon, stadt, plz, strasse,
  region, gewerk, roi, status, source, notiz, touches, synced_at
)
SELECT
  x.id, x.created, x.firma, x.kontakt, x.email, x.website, x.telefon, x.stadt, x.plz, x.strasse,
  x.region, x.gewerk, x.roi, x.status, x.source, x.notiz, x.touches, x.synced_at::timestamptz
FROM jsonb_to_recordset('${payload}'::jsonb) AS x(
  id text, created bigint, firma text, kontakt text, email text, website text, telefon text,
  stadt text, plz text, strasse text, region text, gewerk text, roi int, status text,
  source text, notiz text, touches jsonb, synced_at text
)
WHERE NOT EXISTS (
  SELECT 1 FROM crm_contacts c WHERE lower(trim(c.firma)) = lower(trim(x.firma))
)
RETURNING firma;`;
}

const b1 = rows.slice(0, 25);
const b2 = rows.slice(25);
writeFileSync('scripts/hausverwaltungen-import-b1.sql', mkSql(b1, 'b1'));
writeFileSync('scripts/hausverwaltungen-import-b2.sql', mkSql(b2, 'b2'));
console.log('Batches:', b1.length, '+', b2.length, '=', rows.length);
