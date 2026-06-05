# Supabase Migrations

## Verzeichnis-Übersicht

```
supabase/migrations/
  2026-05-20_initial_schema.sql       — Schema-Snapshot (Referenz, nicht re-runnable)
  2026-05-20_enable_rls.sql           — RLS Policies für crm_contacts, crm_clients, wf_runs
  2026-05-20_rollback_anon_policies.sql — Rollback der RLS auf anon-Vollzugriff
  2026-06-05_create_crm_content.sql     — Content-Tracker Tabelle crm_content
```

## Neue Migration erstellen

1. **Backup ziehen** (Supabase Dashboard → Project Settings → Database → Backups).
2. Neue Datei anlegen: `YYYY-MM-DD_kurze-beschreibung.sql`
3. SQL schreiben (nur additive Änderungen — niemals Spalten löschen/umbenennen ohne Kevin zu fragen).
4. Migration in Supabase anwenden:
   - Via Supabase MCP: `apply_migration`
   - Oder manuell: Supabase Dashboard → SQL Editor → File inhalt einfügen → Run
5. Committen: `git add supabase/migrations/YYYY-MM-DD_*.sql && git commit -m "db: <beschreibung>"`

## Regeln

| Regel | Warum |
|-------|-------|
| Niemals `crm_contacts` droppen | 90+ Kontakte, nicht wiederherstellbar ohne Backup |
| Niemals Spalten umbenennen ohne SCHEMA_MAP.md zu updaten | n8n-Workflows schreiben in diese Spalten |
| Niemals `id` oder `created` ändern | Frontend setzt diese Felder |
| Immer `IF NOT EXISTS` / `IF EXISTS` verwenden | Migrations sollen idempotent sein |

## Spalten die n8n schreibt

Bevor du eine Spalte änderst, prüfe `../n8n-workflows/SCHEMA_MAP.md`.
Wenn eine Spalte von einem Workflow geschrieben wird: erst Workflow anpassen, dann Spalte ändern.

## Aktuelle Schema-Version

Stand 2026-06-05 — `crm_content` live, RLS wie `crm_clients`. Realtime für `crm_contacts`.
