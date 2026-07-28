#!/usr/bin/env node
/**
 * Runs supabase/tests/security_rls.sql against SUPABASE_TEST_DB_URL.
 * Fails closed if the URL is missing or points at production.
 */
import { spawnSync } from 'node:child_process';

const url = process.env.SUPABASE_TEST_DB_URL ?? '';
const productionMarker = 'qdywaenmojdxhfxqbvun';

if (!url) {
  console.error(
    'SUPABASE_TEST_DB_URL is required. Use a dedicated staging or local DB — never production.',
  );
  process.exit(1);
}

if (url.includes(productionMarker)) {
  console.error(
    'SUPABASE_TEST_DB_URL must not point at production (qdywaenmojdxhfxqbvun).',
  );
  process.exit(1);
}

const result = spawnSync(
  'psql',
  [url, '-v', 'ON_ERROR_STOP=1', '-f', 'supabase/tests/security_rls.sql'],
  { stdio: 'inherit', shell: true },
);

process.exit(result.status ?? 1);
