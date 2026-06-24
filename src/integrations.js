import { whFetch } from './wh.js';
import { weekStart } from './analytics.js';

/** WF10 — Kalender-Events dieser Woche (read-only). */
export async function fetchCalendarWeek(weekStartIso) {
  const ws = weekStartIso || weekStart(new Date()).toISOString().slice(0, 10);
  const res = await whFetch('wf10-calendar-week', { week_start: ws });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(err || 'Kalender konnte nicht geladen werden');
  }
  const data = await res.json();
  return data.events || [];
}

/** Phase 2 — Notion-Sync (Stub). */
export async function syncNotionProjects() {
  throw new Error('Notion-Sync noch nicht konfiguriert (WF11).');
}
