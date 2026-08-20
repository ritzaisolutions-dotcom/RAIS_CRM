#!/usr/bin/env node
/**
 * Runs supabase/tests/security_rls.sql against a non-production database.
 *
 * Zwei Wege, in dieser Reihenfolge:
 *   1. `psql` auf dem PATH gegen SUPABASE_TEST_DB_URL
 *   2. `docker exec` in den lokalen Supabase-DB-Container (`supabase start`)
 *
 * Der zweite Weg existiert, weil auf einer typischen Windows-Entwicklermaschine
 * kein `psql` installiert ist — ohne ihn liess sich die Suite lokal überhaupt
 * nicht ausführen, und genau das ist der Grund, warum sie nie gelaufen ist.
 *
 * Fail-closed: ohne explizites Ziel bricht das Skript ab, und ein Ziel, das auf
 * die Produktion zeigt, wird abgelehnt.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const SQL_FILE = 'supabase/tests/security_rls.sql';
const PRODUCTION_REF = 'qdywaenmojdxhfxqbvun';
const LOCAL_DB_CONTAINER = `supabase_db_${PRODUCTION_REF}`;

/** Hosts, die als lokal gelten — dort kann keine Produktionsdatenbank liegen. */
const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', 'host.docker.internal']);

function fail(message) {
  console.error(message);
  process.exit(1);
}

function isLocalUrl(url) {
  try {
    return LOCAL_HOSTS.has(new URL(url).hostname);
  } catch {
    return false;
  }
}

function dockerContainerRunning(name) {
  const res = spawnSync('docker', ['ps', '--filter', `name=^${name}$`, '--format', '{{.Names}}'], {
    encoding: 'utf8',
  });
  return res.status === 0 && res.stdout.trim() === name;
}

function commandExists(bin) {
  const probe = spawnSync(bin, ['--version'], { stdio: 'ignore' });
  return !probe.error;
}

const url = process.env.SUPABASE_TEST_DB_URL ?? '';

// Zielauswahl -----------------------------------------------------------------
let mode = null;

if (url) {
  // Der Marker-Check bleibt, ist aber nur eine grobe Sperre: ein Pooler-Host,
  // eine IP oder ein zweites Produktionsprojekt würden ihn nicht auslösen.
  // Deshalb zusätzlich verlangen, dass das Ziel lokal ist ODER bewusst über
  // ALLOW_REMOTE_RLS_TEST=1 freigegeben wurde.
  if (url.includes(PRODUCTION_REF)) {
    fail(`SUPABASE_TEST_DB_URL must not point at production (${PRODUCTION_REF}).`);
  }
  if (!isLocalUrl(url) && process.env.ALLOW_REMOTE_RLS_TEST !== '1') {
    fail(
      'SUPABASE_TEST_DB_URL points at a remote host. The suite writes fixtures and ' +
        'rolls back, but confirm it is a dedicated staging DB and re-run with ' +
        'ALLOW_REMOTE_RLS_TEST=1.',
    );
  }
  if (!commandExists('psql')) {
    fail('psql not found on PATH. Install the PostgreSQL client, or run `npx supabase start` to use the local container.');
  }
  mode = { kind: 'psql', url };
} else if (dockerContainerRunning(LOCAL_DB_CONTAINER)) {
  mode = { kind: 'docker' };
} else {
  fail(
    'No test database available.\n' +
      '  • Start the local stack:  npx supabase start\n' +
      '  • or set SUPABASE_TEST_DB_URL to a dedicated staging database.\n' +
      'Never point this at production.',
  );
}

// Ausführung ------------------------------------------------------------------
// Kein `shell: true`: die URL enthält Zugangsdaten und würde sonst über cmd.exe
// re-serialisiert — ein unnötiger Injection-Pfad.
const result =
  mode.kind === 'psql'
    ? spawnSync('psql', [mode.url, '-v', 'ON_ERROR_STOP=1', '-f', SQL_FILE], {
        stdio: 'inherit',
      })
    : spawnSync(
        'docker',
        [
          'exec',
          '-i',
          LOCAL_DB_CONTAINER,
          'psql',
          '-U',
          'postgres',
          '-d',
          'postgres',
          '-v',
          'ON_ERROR_STOP=1',
          '-f',
          '-',
        ],
        { input: readFileSync(SQL_FILE), stdio: ['pipe', 'inherit', 'inherit'] },
      );

if (result.error) {
  fail(`Failed to run the RLS suite: ${result.error.message}`);
}

if (result.status === 0) {
  console.log(
    `\nRLS suite passed (${mode.kind === 'docker' ? 'local supabase container' : 'psql'}).`,
  );
}

process.exit(result.status ?? 1);
