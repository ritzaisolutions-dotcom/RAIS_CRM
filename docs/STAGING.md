# Staging — RAIS CRM

Stand: 28.07.2026

## Ziel

Eine **dedizierte** Datenbank (lokal oder separates Supabase-Projekt), niemals
Produktion (`qdywaenmojdxhfxqbvun`). Keine Kopie von Produktionsdaten — nur
anonymisierte Seeds.

## Status Remote-Staging

Am 28.07.2026 konnte kein neues Free-Projekt angelegt werden (Organisations-
Limit: 2 aktive Free-Projekte). Optionen:

1. **Lokal** (Standard für Entwickler): `npx supabase start` + Migrationen + Seed
2. **Free-Slot freimachen**: ungenutztes Projekt pausieren/löschen, dann
   `RAIS CRM Staging` in `eu-central-1` anlegen
3. **Supabase Branch** auf Ritz AI Solutions (~$0.01344/h): frische DB ohne
   Produktionsdaten, Migrationen vom Parent

Nach Anlage: GitHub Secret `SUPABASE_TEST_DB_URL` setzen (Connection String der
Staging-DB). CI schlägt fehl, wenn das Secret fehlt oder die Produktions-Ref
enthält.

## Lokaler Stack

Voraussetzungen: **Docker Desktop läuft** (Linux engine). `.env.local` muss
UTF-8 **ohne BOM** sein — sonst bricht die Supabase CLI mit
`unexpected character` ab.

```bash
# Docker erforderlich
npx supabase start
npx supabase db reset   # Migrationen + seed.sql
npm run test:rls        # braucht SUPABASE_TEST_DB_URL auf lokale DB
```

Lokale DB-URL typischerweise:

```env
SUPABASE_TEST_DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres
```

`supabase/config.toml`:

- `enable_signup = false` (invite-only)
- Exposed schemas: `public, storage, graphql_public, sales`
- Seed: `supabase/seed.sql`

## Seed-Fixtures

| UUID | Rolle |
|------|--------|
| `11111111-1111-4111-8111-111111111111` | Allowlisted App-User (`sales.app_users`) |
| `22222222-…` / `33333333-…` | Sample Prospect + Entscheider |
| `44444444-…` | Sample Kunde |

Auth-User mit denselben UUIDs im Staging-Dashboard anlegen (Invite), bevor
Browser-Smoke-Tests laufen. Die SQL-Suite `security_rls.sql` legt eigene
Transaktions-Fixtures an und rollt sie zurück.

## Migrationsreihenfolge (frisch)

1. `20260727204619_sales_baseline.sql`
2. `20260727233135_harden_sales_security_integrity.sql`
3. `20260728084234_tighten_sales_column_privileges.sql`

Danach: `migration list` / Schema-Snapshot gegen Produktion vergleichen
(Objekte in `sales`, nicht die Remote-Historie 1:1).

## Umgebungsvariablen (nicht committen)

```env
# .env.local — Staging oder lokal
NEXT_PUBLIC_SUPABASE_URL=https://<staging-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<staging-anon-key>
SUPABASE_TEST_DB_URL=postgresql://postgres.<ref>:<password>@aws-0-eu-central-1.pooler.supabase.com:6543/postgres
```

Produktion nie als `SUPABASE_TEST_DB_URL` verwenden.
