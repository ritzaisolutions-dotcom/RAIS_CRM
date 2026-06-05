/**
 * Smoke test for Content page — no auth required for structural checks.
 * Run: node scripts/test-content-smoke.js
 */
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SB_URL = 'https://qdywaenmojdxhfxqbvun.supabase.co';
const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFkeXdhZW5tb2pkeGhmeHFidnVuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU0MDYwMTYsImV4cCI6MjA5MDk4MjAxNn0.rfIzS2eY3yZCvap0pKdB7V-AfKmnvQLx_QLaFEi1gts';

const checks = [];

function ok(name) { checks.push({ name, pass: true }); }
function fail(name, detail) { checks.push({ name, pass: false, detail }); }

const html = readFileSync(join(root, 'index.html'), 'utf8');
const required = [
  'id="page-content"',
  'id="content-stats"',
  'id="content-tbody"',
  'id="contentModal"',
  'data-page="content"',
  "from './src/content.js'",
  'openContentAdd',
  'filterContent',
  'delContent',
];
required.forEach(function(id) {
  if (html.includes(id)) ok('html: ' + id);
  else fail('html: ' + id, 'fehlt in index.html');
});

const sidebar = readFileSync(join(root, 'src', 'sidebar.js'), 'utf8');
if (sidebar.includes("id: 'content'")) ok('sidebar: content entry');
else fail('sidebar: content entry');

const contentJs = readFileSync(join(root, 'src', 'content.js'), 'utf8');
['initContentPage', 'renderContent', 'openContentAdd', 'saveContent', 'delContent', 'filterContent'].forEach(function(fn) {
  if (new RegExp('export (async )?function ' + fn).test(contentJs)) ok('content.js: ' + fn);
  else fail('content.js: ' + fn);
});
if (contentJs.includes("crm_content")) ok('content.js: crm_content endpoint');
else fail('content.js: crm_content endpoint');

try {
  const r = await fetch(SB_URL + '/rest/v1/crm_content?select=id&limit=1', {
    headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY },
  });
  if (r.status === 200) ok('api: crm_content endpoint (anon → 200)');
  else fail('api: crm_content endpoint', 'status ' + r.status);
  const body = await r.json();
  if (Array.isArray(body)) ok('api: anon returns array (RLS)');
  else fail('api: anon response', 'not array');
} catch (e) {
  fail('api: crm_content', e.message);
}

const failed = checks.filter(function(c) { return !c.pass; });
checks.forEach(function(c) {
  console.log((c.pass ? '✓' : '✗') + ' ' + c.name + (c.detail ? ' — ' + c.detail : ''));
});
console.log('');
if (failed.length) {
  console.error('Smoke test FAILED (' + failed.length + ' checks)');
  process.exit(1);
}
console.log('Smoke test PASSED (' + checks.length + ' checks)');
