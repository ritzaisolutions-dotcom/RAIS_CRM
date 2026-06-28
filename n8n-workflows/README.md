# n8n Workflows

Kanonischer Export-Ordner für alle n8n-Workflows.

## Inhalt

| Datei | Workflow | Zweck |
|-------|---------|-------|
| `WF1_Discover.json` | wf1-discover | Google Places → neue Leads in crm_contacts |
| `WF2_Qualify.json` | wf2-qualify | Website-Analyse + Lead Score |
| `WF3_Enrich.json` | wf3-enrich | Kontakt/Email/Social Media anreichern |
| `WF4_Email1.json` | wf4-email1 | LLM-generierte Email 1 erstellen + senden |
| `WF5_Email2.json` | wf5-email2 | Follow-up Email 2 senden |
| `WF6_Email3.json` | wf6-email3 | Abschluss-Follow-up Email 3 senden |
| `WF7_Compose.json` | wf7-compose | CRM Einzelmail (kevin@ritz-ai.solutions) |
| `WF8_Calendar.json` | wf8-calendar | CRM Demo/Rückruf → Google Kalender |
| `WF9_SalesRep.json` | wf9-salesrep | CRM Sales Rep Assistant (Gemini) |
| `WF10_CalendarWeek.json` | wf10-calendar-week | Kalender-Wochenansicht |

WF11/WF12 (Notion) sind im Proxy definiert, noch ohne JSON-Export im Repo.

## Webhook-Endpunkte

Basis-URL: `https://n8n.ritz-ai.solutions/webhook/`

| Workflow | Pfad |
|---------|------|
| WF1–WF6 | `wf1-discover` … `wf6-email3` |
| WF7–WF12 | `wf7-compose` … `wf12-notion-update` |

## Auth

- **WF7–WF12:** CRM → `api/n8n-proxy.js` (Supabase JWT) → n8n mit Header `X-CRM-Proxy-Secret`
- **WF1–WF6:** serverseitig in n8n; Supabase via `$env.SUPABASE_SERVICE_ROLE_KEY`

## Secrets (n8n Environment, nicht in JSON)

| Variable | Verwendung |
|----------|------------|
| `SUPABASE_SERVICE_ROLE_KEY` | WF1–WF6 Supabase-Zugriff |
| `GOOGLE_MAPS_API_KEY` | WF1, WF2 Places API |
| `N8N_PROXY_SECRET` | WF7–WF12 Proxy-Header-Prüfung |

## Deploy

1. n8n → Import from File
2. Env-Variablen in n8n setzen
3. Credentials zuweisen (SMTP, Google Calendar, Gemini)
4. Workflow aktivieren
5. Export zurück ins Repo committen

Siehe auch `SCHEMA_MAP.md` und `SECURITY.md`.
