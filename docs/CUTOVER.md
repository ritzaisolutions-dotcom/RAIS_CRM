# Production Cutover & Rollback

Stand: 28.07.2026 · Produktion: `qdywaenmojdxhfxqbvun`

## Vorbedingungen (Abbruch, wenn nicht erfüllt)

- [ ] Review-Branch gemerged; `npm run validate` und CI grün
- [ ] `SUPABASE_TEST_DB_URL` zeigt auf Staging (nicht Produktion); RLS-Suite grün
- [ ] Backup der Produktions-DB verifiziert (Dashboard → Database → Backups)
- [ ] Wartungsfenster / Rollback-Verantwortung benannt
- [ ] Auth-Checkliste (`docs/AUTH_CHECKLIST.md`) abgehakt
- [ ] Preview-Deployment gegen Staging-Variablen smoke-getestet

## Cutover-Reihenfolge

1. **Backup** erstellen und Restore-Pfad notieren (Shared-Project: Restore ist
   nicht sales-isoliert — siehe SECURITY.md).
2. **Migrationen** nur aus versioniertem Git anwenden. Auf Produktion sind
   Hardening-Migrationen bereits live (`harden_sales_security_integrity`,
   `tighten_sales_column_privileges`). Keine ad-hoc Dashboard/MCP-Schema-
   Änderungen ohne Migration.
3. **App deployen** (Vercel Production) mit Produktions-`NEXT_PUBLIC_SUPABASE_*`.
4. **Sofort-Checks** (unten).

## Live-Nachkontrolle

```sql
-- Migration history (erwartete letzte Sales-Härtungen vorhanden)
SELECT version, name FROM supabase_migrations.schema_migrations
WHERE version >= '20260727'
ORDER BY version;

-- Kein anon USAGE; Allowlist-Policies
SELECT has_schema_privilege('anon', 'sales', 'USAGE') AS anon_usage; -- false

SELECT tablename, policyname, cmd
FROM pg_policies
WHERE schemaname = 'sales'
ORDER BY 1, 2;
-- erwartet: is_app_user()-Policies, kein authenticated_all

-- Append-only Trigger
SELECT tgname FROM pg_trigger t
JOIN pg_class c ON c.oid = t.tgrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'sales' AND c.relname = 'touchpoints'
  AND tgname = 'touchpoints_append_only';

-- Kritische RPCs
SELECT proname FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'sales'
  AND proname IN (
    'create_company','set_pipeline_status','upsert_person_atomic',
    'gdpr_anonymize','log_touch','analytics_dashboard','is_app_user'
  );
```

Dashboard:

- Advisors (Security / Performance) für `sales` prüfen
- Login als allowlisted User → `/liste`
- Login als nicht-allowlisted → kein CRM-Zugang
- Header: `X-Frame-Options`, `X-Content-Type-Options`, HSTS (Production)

## Rollback

| Szenario | Aktion |
|----------|--------|
| App-Bug, Schema ok | Vercel auf vorheriges Deployment zurücksetzen |
| Schema-Regression | Backup-Restore (gesamtes Projekt) oder gezielte Forward-Fix-Migration — nie Remote-Historie umschreiben |
| Auth-Fehlkonfiguration | Sign-up/Redirects in Dashboard korrigieren; Deploy pausieren |

Abbruchkriterien vor Go-live: fehlende Backup-Bestätigung, CI rot, Staging-RLS
fehlgeschlagen, oder Auth öffentlich offen.

## Baseline-Cutover-Punkt

Frische Umgebungen starten bei `20260727204619_sales_baseline` + Hardening.
Produktion behält ihre Remote-Historie; lokale Baseline ist die
**dokumentierte** Reproduktionsquelle, kein Rewrite der Live-Historie.
