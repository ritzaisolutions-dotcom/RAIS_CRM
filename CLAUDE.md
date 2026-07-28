# CLAUDE.md

Guidance for working in this repository.

## Commands

```bash
npm run dev
npm run lint
npm run build
```

## Architecture

Next.js App Router + TypeScript + Tailwind. Data lives in Supabase schema **`sales`**. Browser client uses anon key + user JWT (`db.schema: 'sales'`). RLS requires `auth.uid() IS NOT NULL`.

### Surface

- `/liste` — Prospects (`v_call_liste`)
- `/kunden` — Kunden (`v_kunden_liste`)
- `/firma/[id]` — Detail (qualification edits, people CRUD, append-only touches, opportunities)
- `/login` — Supabase Auth

### Non-goals

Kanban, charts reinventing `v_akquise_*`, bulk-edit, import UI, Notion freeform columns, Sessions, Network, n8n compose UI, service-role in client.

### Client write rules

1. Touchpoints: INSERT / `log_touch` only — never UPDATE/DELETE
2. Companies: never DELETE — `Ausgeschlossen` or `sales.gdpr_anonymize`
3. Company editable fields only: `mitarbeiterzahl`, `crm_system`, `anfragen_pro_woche`, `relationship`
4. Never send `bundesland` or `region`

## UI

All labels German. Brand colors from `brand.md`. Density inspired by Lytic; no purple SaaS defaults.

## Migrations

SQL under `supabase/migrations/` including 2026-07-27 sales Auth/RLS, GDPR anonymize, constraints + `v_kunden_liste`.
