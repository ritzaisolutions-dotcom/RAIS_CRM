# Security — RAIS CRM

## RLS prüfen

```sql
SELECT tablename, policyname, roles FROM pg_policies
WHERE schemaname = 'public' ORDER BY tablename;
```

Erwartung: CRM-Tabellen nur `authenticated`. `anon` nur bei öffentlichen INSERT-Only-Tabellen (`roi_leads`, `inbound_leads`).

## Secrets

| Secret | Wo | Nie im Git |
|--------|-----|------------|
| Supabase Service Role | n8n Env `SUPABASE_SERVICE_ROLE_KEY` | Ja |
| Google Maps API | n8n Env `GOOGLE_MAPS_API_KEY` | Ja |
| n8n Proxy Secret | Vercel + n8n `N8N_PROXY_SECRET` | Ja |
| Supabase Anon Key | `src/supabase.js` (öffentlich, RLS schützt) | OK |

## n8n-Workflows

- WF7–WF12: CRM ruft nur über `/api/n8n-proxy` auf (Supabase JWT)
- Webhooks prüfen `X-CRM-Proxy-Secret` im ersten Code-Node
- WF1–WF6: serverseitig in n8n, Service Role für Supabase

## PII

- Keine Kontaktlisten (CSV/JSON) committen — siehe `.gitignore`
- `localStorage` wird bei Logout und Session-Ablauf geleert

## Notfall

`supabase/migrations/2026-05-20_rollback_anon_policies.EMERGENCY_ONLY.sql` — nur bei Ausfall, macht anon wieder vollzugriffsfähig.
