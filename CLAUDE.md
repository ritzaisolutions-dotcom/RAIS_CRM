# CLAUDE.md

Guidance for working in this repository.

## Commands

```bash
npm run dev
npm run lint
npm run build
```

## Architecture

Next.js App Router + TypeScript + Tailwind. Data lives in Supabase schema **`sales`**. Browser client uses anon key + user JWT (`db.schema: 'sales'`). RLS requires `sales.is_app_user()` — angemeldet **und** in `sales.app_users` freigeschaltet. Ein bloß angemeldeter Auth-Nutzer sieht nichts.

### Surface

- `/liste` — Prospects (`v_call_liste`, serverseitig gefiltert/paginiert)
- `/kunden` — Kunden (`v_kunden_liste`)
- `/firma/[id]` — Detail (qualification edits, people CRUD, append-only touches, opportunities)
- `/analytics` — Akquise-Dashboard (`analytics_dashboard`)
- `/login` — Supabase Auth
- `/kein-zugriff` — angemeldet, aber nicht freigeschaltet

### Zeit

Alle Tages- und Periodengrenzen laufen über `Europe/Berlin`, nicht UTC:
`businessToday()` / `rangeBounds()` in `src/lib/sales/dates.ts`, `sales.business_today()`
und `sales.business_day_start()` in der Datenbank. Niemals `new Date().toISOString().slice(0, 10)`
oder blankes `CURRENT_DATE` verwenden.

### Non-goals

Kanban, charts reinventing `v_akquise_*`, bulk-edit, import UI, Notion freeform columns, Sessions, Network, n8n compose UI, service-role in client.

### Client write rules

1. Touchpoints: nur über `sales.log_touch` — direktes INSERT ist entzogen
   (die RPC prüft, dass die Person zur Firma gehört). Nie UPDATE/DELETE.
   Fehleingaben über `sales.void_touch` stornieren, nicht löschen.
2. Companies: never DELETE — `Ausgeschlossen` or `sales.gdpr_anonymize`
3. Company editable fields only: `mitarbeiterzahl`, `crm_system`, `anfragen_pro_woche`
4. `relationship` ist **nicht** clientseitig schreibbar — es wird aus
   `pipeline_status` abgeleitet (`sales.set_pipeline_status`) und per CHECK
   erzwungen
5. Never send `bundesland` or `region`

## UI

All labels German. Brand colors from `brand.md`. Density inspired by Lytic; no purple SaaS defaults.

## Migrations

SQL under `supabase/migrations/` including 2026-07-27 sales Auth/RLS, GDPR anonymize, constraints + `v_kunden_liste`.
