import { SB_URL, SB_KEY } from '../src/supabase.js';

const N8N = {
  'wf7-compose': 'https://n8n.ritz-ai.solutions/webhook/wf7-compose',
  'wf8-calendar': 'https://n8n.ritz-ai.solutions/webhook/wf8-calendar',
  'wf9-salesrep': 'https://n8n.ritz-ai.solutions/webhook/wf9-salesrep',
  'wf10-calendar-week': 'https://n8n.ritz-ai.solutions/webhook/wf10-calendar-week',
  'wf11-notion-read': 'https://n8n.ritz-ai.solutions/webhook/wf11-notion-read',
  'wf12-notion-update': 'https://n8n.ritz-ai.solutions/webhook/wf12-notion-update',
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const auth = req.headers.authorization || '';
  if (!auth.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Nicht angemeldet' });
  }

  const sbUrl = process.env.SUPABASE_URL || SB_URL;
  const sbKey = process.env.SUPABASE_ANON_KEY || process.env.SB_KEY || SB_KEY;

  const userRes = await fetch(sbUrl + '/auth/v1/user', {
    headers: { apikey: sbKey, Authorization: auth },
  });
  if (!userRes.ok) {
    return res.status(401).json({ error: 'Session ungültig' });
  }

  const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
  const workflow = body.workflow;
  const target = N8N[workflow];
  if (!target) {
    return res.status(400).json({ error: 'Unbekannter Workflow' });
  }

  const payload = Object.assign({}, body);
  delete payload.workflow;

  const n8nRes = await fetch(target, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const text = await n8nRes.text();
  const ct = n8nRes.headers.get('content-type') || 'application/json';
  res.status(n8nRes.status).setHeader('Content-Type', ct);
  return res.send(text);
}
