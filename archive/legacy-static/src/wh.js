import { getAuthToken, isAuthenticated } from './supabase.js';

export { isAuthenticated };

/** n8n-Webhook über Server-Proxy (Auth nur via Supabase-JWT). */
export async function whFetch(workflow, payload) {
  if (!isAuthenticated()) throw new Error('Bitte anmelden.');
  return fetch('/api/n8n-proxy', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + getAuthToken(),
    },
    body: JSON.stringify(Object.assign({ workflow: workflow }, payload || {})),
  });
}
