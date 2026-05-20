export const SB_URL  = 'https://qdywaenmojdxhfxqbvun.supabase.co';
export const SB_KEY  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFkeXdhZW5tb2pkeGhmeHFidnVuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU0MDYwMTYsImV4cCI6MjA5MDk4MjAxNn0.rfIzS2eY3yZCvap0pKdB7V-AfKmnvQLx_QLaFEi1gts';

const SB_HDR_GET    = { 'apikey': SB_KEY, 'Authorization': 'Bearer ' + SB_KEY };
const SB_HDR_UPSERT = { 'apikey': SB_KEY, 'Authorization': 'Bearer ' + SB_KEY, 'Content-Type': 'application/json', 'Prefer': 'resolution=merge-duplicates,return=minimal' };

export async function sbGet(path) {
  const r = await fetch(SB_URL + path, { headers: SB_HDR_GET });
  if (!r.ok) throw new Error(await r.text());
  const txt = await r.text();
  return txt ? JSON.parse(txt) : [];
}
export async function sbUpsert(path, body) {
  const r = await fetch(SB_URL + path, { method: 'POST', headers: SB_HDR_UPSERT, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(await r.text());
}
export async function sbDelete(path) {
  const r = await fetch(SB_URL + path, { method: 'DELETE', headers: Object.assign({}, SB_HDR_GET, { 'Prefer': 'return=minimal' }) });
  if (!r.ok) throw new Error(await r.text());
}
