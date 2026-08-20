export const SB_URL  = 'https://qdywaenmojdxhfxqbvun.supabase.co';
export const SB_KEY  = ''; // REDAKTIERT 2026-08-20: hier lag der produktive anon-Key im Klartext. Key rotiert; nie wieder einchecken.

let _token = SB_KEY;
let _sbClient = null;

export function setAuthToken(t) { _token = t; }
export function getAuthToken() { return _token; }
export function setSupabaseClient(c) { _sbClient = c; }
export function getSupabase() { return _sbClient; }

export function isAuthenticated() {
  return !!(_token && _token !== SB_KEY);
}

/** Authenticated user UUID from JWT (null when not logged in). */
export function getAuthUserId() {
  const token = getAuthToken();
  if (!token || token === SB_KEY) return null;
  try {
    const part = token.split('.')[1];
    if (!part) return null;
    const json = JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/')));
    return json.sub || null;
  } catch (e) {
    return null;
  }
}

function hdrGet()    { return { 'apikey': SB_KEY, 'Authorization': 'Bearer ' + _token }; }
function hdrUpsert() { return { 'apikey': SB_KEY, 'Authorization': 'Bearer ' + _token, 'Content-Type': 'application/json', 'Prefer': 'resolution=merge-duplicates,return=minimal' }; }

export async function sbGet(path) {
  const r = await fetch(SB_URL + path, { headers: hdrGet() });
  if (!r.ok) throw new Error(await r.text());
  const txt = await r.text();
  return txt ? JSON.parse(txt) : [];
}
export async function sbUpsert(path, body) {
  const r = await fetch(SB_URL + path, { method: 'POST', headers: hdrUpsert(), body: JSON.stringify(body) });
  if (!r.ok) throw new Error(await r.text());
}
export async function sbDelete(path) {
  const r = await fetch(SB_URL + path, { method: 'DELETE', headers: Object.assign(hdrGet(), { 'Prefer': 'return=minimal' }) });
  if (!r.ok) throw new Error(await r.text());
}
