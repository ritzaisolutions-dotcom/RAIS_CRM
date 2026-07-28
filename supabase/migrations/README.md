# Supabase Migrations — Sales CRM Cutover

Stand: 28.07.2026 · Produktion: `qdywaenmojdxhfxqbvun`

## Sales-Cutover-Kette (ab 2026-07-27)

Diese Migrationen bilden das **`sales`**-Schema reproduzierbar nach. Ältere
`public.crm_*`-Migrationen bleiben für den Shared-Project-Kontext, sind aber
**nicht** Teil des CRM-Neustarts.

| Version | Datei | Remote-Name | Beschreibung |
|---------|-------|-------------|--------------|
| `20260727204619` | `20260727204619_sales_baseline.sql` | `create_sales_schema` … `sales_analytics_dashboard` | Vollständige Baseline inkl. Views, Trigger, `touchpoints_append_only` |
| `20260727233135` | `20260727233135_harden_sales_security_integrity.sql` | `harden_sales_security_integrity` | Allowlist-RLS, atomare RPCs, GDPR-Härtung |
| `20260728084234` | `20260728084234_tighten_sales_column_privileges.sql` | `tighten_sales_column_privileges` | Spaltenrechte + Audit-Trigger |

### Produktion (bereits angewendet)

Remote-Historie bis `20260728084338` ist live. **Nicht** nachträglich umschreiben.
Lokale Dateinamen sind an Remote-Versionen angeglichen.

### Frische Staging-Datenbank

```bash
# 1. Separates Supabase-Projekt anlegen (nie Produktionsdaten kopieren)
# 2. Auth-User anlegen + seed.sql UUIDs matchen
# 3. Migrationen anwenden:
npx supabase db push --db-url "$SUPABASE_TEST_DB_URL"
# 4. Seed:
psql "$SUPABASE_TEST_DB_URL" -f supabase/seed.sql
# 5. Sicherheitstests:
psql "$SUPABASE_TEST_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/security_rls.sql
```

### Baseline regenerieren

```bash
SUPABASE_DB_URL="postgresql://..." node scripts/export-sales-baseline.mjs
# oder nach supabase link:
node scripts/build-sales-baseline.mjs
```

## Archiv

Superseded lokale Entwürfe: `supabase/migrations/archive/sales-pre-baseline/`

## Regeln

- `touchpoints` append-only — Trigger `touchpoints_append_only` muss existieren
- Keine `companies` DELETE aus der App
- Pipeline-Status nur über `sales.set_pipeline_status`
- `public.crm_contacts`-Backfill nur für Produktions-Migration, nicht Staging
