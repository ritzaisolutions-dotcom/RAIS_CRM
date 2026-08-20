#!/usr/bin/env node
/**
 * Regenerates supabase/migrations/20260727204619_sales_baseline.sql
 * from a live sales schema using pg_dump.
 *
 * Usage (requires Supabase DB password, never commit the URL):
 *   SUPABASE_DB_URL="postgresql://postgres.[ref]:[password]@aws-0-eu-central-1.pooler.supabase.com:6543/postgres" \
 *     node scripts/export-sales-baseline.mjs
 *
 * Or after `supabase link`:
 *   npx supabase db dump --schema sales -f supabase/migrations/20260727204619_sales_baseline.sql --linked
 */
import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'supabase/migrations/20260727204619_sales_baseline.sql');
const dbUrl = process.env.SUPABASE_DB_URL;

const header = `-- Sales schema baseline (cutover 2026-07-27)
-- Reproduces remote migration chain through analytics_dashboard (pre-hardening).
-- Fresh installs: baseline → harden_sales_security_integrity → tighten_sales_column_privileges
-- Production qdywaenmojdxhfxqbvun: already applied; do not re-run manually.

`;

if (dbUrl) {
  mkdirSync(dirname(out), { recursive: true });
  const dump = execSync(
    `pg_dump "${dbUrl}" --schema=sales --schema-only --no-owner --no-privileges`,
    { encoding: 'utf8' },
  );
  writeFileSync(out, header + dump);
  console.log(`Wrote ${out} (${dump.length} bytes)`);
} else {
  console.log(`Set SUPABASE_DB_URL to regenerate ${out}`);
  console.log('Committed baseline in repo is the canonical cutover snapshot.');
  process.exit(0);
}
