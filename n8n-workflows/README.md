# n8n Workflows

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
| `WF8_Calendar.json` | wf8-calendar | CRM Demo/Rückruf → Google Kalender (ritzaisolutions@gmail.com) |

## Webhook-Endpunkte

Basis-URL: `https://n8n.ritz-ai.solutions/webhook/`

| Workflow | Pfad |
|---------|------|
| WF1 | `wf1-discover` |
| WF2 | `wf2-qualify` |
| WF3 | `wf3-enrich` |
| WF4 | `wf4-email1` |
| WF5 | `wf5-email2` |
| WF6 | `wf6-email3` |
| WF7 | `wf7-compose` |
| WF8 | `wf8-calendar` |

**Auth:** Alle Webhooks erwarten Header `X-RAIS-Token: <token>` (Phase 1.5).

## Workflow nach n8n deployen

Manueller Import (kein CI/CD nötig):

1. n8n öffnen → **Workflows** → **Import from File**
2. JSON-Datei aus diesem Ordner hochladen
3. Credentials prüfen (Supabase Service Role Key, Email-Provider)
4. Workflow aktivieren (Toggle oben rechts)

## Workflow ändern und versionieren

1. Workflow in n8n anpassen und testen
2. **Export:** Workflow öffnen → Menü (3 Punkte) → **Export** → JSON herunterladen
3. Datei hier ersetzen: `WFx_Name.json`
4. Committen:
   ```
   git add n8n-workflows/WF4_Email1.json
   git commit -m "n8n WF4: Anlass-Feld zur Email-Generierung hinzugefügt"
   ```

## Schema-Abhängigkeiten

Welche DB-Spalten welcher Workflow schreibt → siehe `SCHEMA_MAP.md`.

Vor jeder Supabase-Schema-Änderung: `SCHEMA_MAP.md` prüfen.
