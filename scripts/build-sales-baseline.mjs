import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'supabase/migrations/20260727204619_sales_baseline.sql');
const tables = join(root, 'supabase/migrations/.baseline_tables.sql');

const enums = {
  abbruchgrund: ['zu_klein', 'kein_schmerz', 'kein_budget', 'kein_interesse', 'timing'],
  crm_system: ['onOffice', 'Propstack', 'FlowFact', 'FIO Webmakler', 'kein CRM', 'unbekannt'],
  doc_typ: ['transkript', 'angebot', 'sop', 'sonstiges'],
  knowledge_quelle: [
    'Discovery Call',
    'Demo',
    'Check-in',
    'LinkedIn DM',
    'Build/Debug',
    'Kundenfeedback',
    'Recherche',
  ],
  knowledge_status: ['Hypothese', 'Bestaetigt', 'Widerlegt', 'Veraltet'],
  knowledge_typ: ['Sales', 'Technisch', 'Prozess', 'Positionierung', 'Produkt', 'Recht/DSGVO'],
  lead_quelle: ['IS24', 'Immowelt', 'IVD', 'LinkedIn', 'manuell', 'Inbound Website'],
  mitarbeiter_klasse: ['1-2', '3-5', '5-25', '25+', 'unbekannt'],
  opp_stage: ['offen', 'angebot_raus', 'gewonnen', 'verloren'],
  opp_variante: ['system_3k', 'system_crm_6k'],
  pipeline_status: [
    'neu',
    'kein_anschluss_1',
    'kein_anschluss_2',
    'kein_anschluss_3',
    'kein_anschluss_4',
    'kein_anschluss_5',
    'callback',
    'disqualified',
    'set_appointment',
    'closed',
    'kunde',
  ],
  rechtsform: ['GmbH', 'GmbH & Co. KG', 'UG', 'Einzelunternehmen', 'unbekannt'],
  region_cluster: ['RLP', 'Rhein-Main', 'NRW', 'Sonstige'],
  relationship: ['Prospect', 'Kunde', 'Ausgeschlossen'],
  touch_ergebnis: [
    'nicht_erreicht',
    'erreicht_ohne_gespraech',
    'disqualifiziert',
    'gespraech_ohne_termin',
    'termin_gebucht',
    'kein_ergebnis',
  ],
  touch_kanal: ['call', 'dm', 'email', 'meeting', 'engagement', 'status_change'],
};

let sql = `-- Sales schema baseline (cutover 2026-07-27)
-- Remote chain: create_sales_schema … sales_analytics_dashboard
-- Fresh installs: baseline → harden_sales_security_integrity → tighten_sales_column_privileges
-- Production qdywaenmojdxhfxqbvun: already applied via remote history.

CREATE SCHEMA IF NOT EXISTS sales;

`;

for (const [name, values] of Object.entries(enums)) {
  const vals = values.map((value) => `'${value.replace(/'/g, "''")}'`).join(', ');
  sql += `DO $$ BEGIN CREATE TYPE sales.${name} AS ENUM (${vals}); EXCEPTION WHEN duplicate_object THEN NULL; END $$;\n\n`;
}

sql += readFileSync(tables, 'utf8');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, sql);
console.log(`Wrote ${out} (${sql.length} bytes)`);
