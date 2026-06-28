# Supabase Migrations

## Verzeichnis (Stand 2026-06-30)

| Datei | Beschreibung |
|-------|--------------|
| `2026-05-20_initial_schema.sql` | Schema-Snapshot (Referenz, nicht re-runnable) |
| `2026-05-20_enable_rls.sql` | RLS: authenticated-only für contacts/clients/wf_runs |
| `2026-05-20_rollback_anon_policies.EMERGENCY_ONLY.sql` | Notfall-Rollback — nicht in Normalbetrieb |
| `2026-05-22_create_sessions_tables.sql` | crm_sessions + crm_session_events |
| `2026-05-22_rollback_sessions.sql` | Sessions-Rollback |
| `2026-05-29_remove_versicherungsmakler.sql` | Versicherungsmakler bereinigen |
| `2026-05-31_crm_sessions_action_items.sql` | action_items auf Sessions |
| `2026-06-05_create_crm_content.sql` | crm_content (historisch; gedroppt in 2026-06-30) |
| `2026-06-07_dedupe_hausverwaltung.sql` | HV-Deduplizierung |
| `2026-06-15_create_crm_gewerke.sql` | crm_gewerke |
| `2026-06-16_crm_lead_taxonomy.sql` | Lead-Taxonomie |
| `2026-06-16_create_crm_network.sql` | crm_network |
| `2026-06-16_crm_lebensbereiche.sql` | Lebensbereiche + Gewerke |
| `2026-06-24_crm_restructure.sql` | crm_projects + crm_todos (historisch; gedroppt) |
| `2026-06-24_crm_todo_categories.sql` | Todo-Kategorien |
| `2026-06-25_crm_status_simplify.sql` | Status-Vereinfachung |
| `2026-06-26_remove_nameless_leads.sql` | Namenlose Leads entfernen |
| `2026-06-28_drop_hv_lead_scraper.sql` | HV Lead Scraper droppen |
| `2026-06-29_crm_activity_daily.sql` | crm_activity_daily |
| `2026-06-29_crm_contacts_hv_sizing.sql` | HV-Sizing-Felder |
| `2026-06-29_lead_origin_meta_ads.sql` | Meta Ads Origin |
| `2026-06-30_fix_anon_policies.sql` | anon_all schließen (network, gewerke, lebensbereiche) |
| `2026-06-30_drop_content_and_projects.sql` | crm_content, crm_projects, crm_todos droppen |

## Neue Migration

1. Backup (Supabase Dashboard)
2. `YYYY-MM-DD_kurze-beschreibung.sql` anlegen
3. In Supabase SQL Editor oder via MCP anwenden
4. Committen

## Regeln

- `crm_contacts` nie droppen
- Spaltenänderungen: zuerst `n8n-workflows/SCHEMA_MAP.md` prüfen
- Immer idempotent (`IF NOT EXISTS` / `IF EXISTS`)

## Schema-Stand

2026-06-30 — Lean CRM ohne Content/Projekte-Tabellen. RLS authenticated für alle CRM-Tabellen.
