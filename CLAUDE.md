# CLAUDE.md

Guidance for working in this repository.

## Commands

```bash
npm run dev
npm run lint
npm run build
```

## Architecture

Next.js App Router + TypeScript + Tailwind. Data lives in Supabase schema **`sales`**. Browser client uses anon key + user JWT (`db.schema: 'sales'`). RLS requires `sales.is_app_user()` — seit 2026-11-25 heißt das nur noch „angemeldet“ (Freigabeliste `sales.app_users` abgeschaltet, Tabelle bleibt für den Rückweg; siehe Migration `20261125130000_drop_app_user_allowlist.sql`). Jedes Konto im Supabase-Auth-Projekt sieht damit alle CRM-Daten.

### Surface

In der Navigation (Close-Stil, `EfferdShell` = `AppShell`):

- `/leads` — eine Lead-Liste mit Ansichten (`v_leads`; Logik in `src/lib/sales/leads.ts`, Queries in `leadQueries.ts`)
- `/wiedervorlagen` — fällige Wiedervorlagen + offene Aufgaben
- `/plan` — Wochenansicht: Google-Termine (Edge Function `calendar-invite`, action `events`, Meet-Button, Zuordnung zum Lead über Teilnehmer-E-Mail) + Wiedervorlagen + Aufgaben je Tag
- `/ki` — KI-Chat mit Modellwahl (Claude, ChatGPT, Gemini, Grok, Mistral); Keys nur als Server-Umgebungsvariablen, Anbindung in `src/lib/ai/providers.ts`, Route `/api/ki/chat` streamt Text; Verlauf wird nicht gespeichert
- `/import` — CSV-Assistent (Mapping, Bereinigung, `sales.import_leads`)
- `/vorlagen` — E-Mail-Vorlagen mit Variablen (`src/lib/sales/templateVars.ts`)
- `/firma/[id]` — Lead-Detail, drei Spalten (Steckbrief · Composer + Aktivität · Aufgaben/Recherche/Opportunity)
- `/einstellungen` — freie Felder, Sequenzen, Workflows, Verbindungen
- `/login` — Supabase Auth
- `/kein-zugriff` — angemeldet, aber nicht freigeschaltet

Nicht in der Navigation, Code bleibt: `/kundensysteme`, `/analytics`, `/liste/dialen`, `/buchung/*`.
`/liste`, `/termine`, `/kunden`, `/todos` leiten auf die neuen Seiten um.

### UI

Tokens in `src/app/globals.css` (neutral, Hell/Dunkel über `.dark`, Akzent `--accent`).
Bausteine in `src/components/ui/` (Button, Input/Field, Badge, Menu/Popover/Tooltip,
Dialog, Tabs/Checkbox, Panel). Neue Seiten nutzen diese statt der alten `.btn`/`.field`-Klassen.

### Zeit

Alle Tages- und Periodengrenzen laufen über `Europe/Berlin`, nicht UTC:
`businessToday()` / `rangeBounds()` / `addBusinessDays()` in `src/lib/sales/dates.ts`,
`sales.business_today()` und `sales.business_day_start()` in der Datenbank.
Niemals `new Date().toISOString().slice(0, 10)` oder blankes `CURRENT_DATE` verwenden.
Follow-up-Presets rollen Wochenenden auf Montag vor.

### Non-goals

Kanban, charts reinventing `v_akquise_*`, bulk-edit, import UI, Sessions, Network,
n8n compose UI, service-role in client. (Freie Lead-Spalten sind **erlaubt** —
siehe Custom fields unten.)

### Client write rules

1. Touchpoints: nur über `sales.log_touch` — direktes INSERT ist entzogen
   (die RPC prüft, dass die Person zur Firma gehört). Nie UPDATE/DELETE.
   Fehleingaben über `sales.void_touch` stornieren, nicht löschen.
2. Companies: never DELETE — `Ausgeschlossen` or `sales.gdpr_anonymize`
3. Company editable fields: Stammdaten + Qualifikation inkl. `inserate_aktiv`,
   `meta_ads`, `linkedin_url` (siehe contract); Tasks über `sales.create_task`
4. `relationship` ist **nicht** clientseitig schreibbar — es wird aus
   `pipeline_status` abgeleitet (`sales.set_pipeline_status`) und per CHECK
   erzwungen
5. Never send `bundesland` or `region`
6. Custom fields: defs/values über RLS + `reorder_custom_field_defs` /
   `setCustomFieldValue` — kein service-role im Client; Soft-Deactivate statt Hard-Delete

### Custom fields

`sales.custom_field_defs` + `sales.custom_field_values` (EAV). Feste High-Signal-
Spalten bleiben first-class (`meta_ads`, `linkedin_url`, CRM enum). KI-Brief
(`summarizeLead`) nur serverseitig mit `ANTHROPIC_API_KEY`.

## UI

All labels German. Brand colors from `brand.md`. Density inspired by Lytic; no purple SaaS defaults.

## Migrations

SQL under `supabase/migrations/` including 2026-07-27 sales Auth/RLS, GDPR anonymize, constraints + `v_kunden_liste`.
