# Sales schema contract (frontend)

Project: `qdywaenmojdxhfxqbvun` · Schema: **`sales`** · Contract date: 28.07.2026

## Auth

- Supabase Auth + anon key + user JWT
- RLS: `(SELECT sales.is_app_user())` on all application-accessible base tables
- Authenticated users outside `sales.app_users` have no Sales access
- No service-role in the browser

## Routes

- `/login`, `/liste` (`v_call_liste`), `/kunden` (`v_kunden_liste`), `/firma/[id]`, `/analytics`

## Write rules

1. Touchpoints append-only
2. Companies never hard-deleted
3. List **Status** = `companies.pipeline_status` (legacy pipeline), not last touch `ergebnis`
4. Status change updates `pipeline_status` (+ relationship for Kunde / DQ) and inserts a touch with kanal Call|DM
5. Never write `bundesland` / `region`
6. LinkedIn DMs KPI = touches with `kanal = 'dm'`
7. Firma + optionaler Entscheider sowie Pipeline-Status + Touch werden atomar
   über RPCs geschrieben

## Pipeline status (`sales.pipeline_status`)

`neu`, `kein_anschluss_1`…`_5`, `callback`, `disqualified`, `set_appointment`, `closed`, `kunde`

- `kunde` → `relationship = Kunde`
- `disqualified` → `relationship = Ausgeschlossen`

## Editable company fields

Stammdaten: `name`, `stadt`, `telefon`, `website`, `instagram_url`, `facebook_url`, `pipeline_status`

Qualifikation: `mitarbeiterzahl`, `crm_system`, `anfragen_pro_woche`, `relationship`

## RPCs

- `sales.log_touch(...)`
- `sales.create_company(...)`
- `sales.set_pipeline_status(...)`
- `sales.upsert_person_atomic(...)`
- `sales.gdpr_anonymize(company_id)` — Art.17 only
- `sales.akquise_kpis(p_from, p_to)`
- `sales.analytics_dashboard(p_from, p_to)` — priorisierter Funnel, Tagessteuerung, Kanal- und Commercial-KPIs
- `sales.pipeline_status_counts()`

## Ops

- Confirm Dashboard → API → Exposed schemas includes `sales`
- Public sign-up disabled; users are invite-only and must also be inserted into
  `sales.app_users` (see `docs/AUTH_CHECKLIST.md`)
- Views are `security_invoker`; authenticated grants are relation-specific
- Shared project restore is not sales-isolated (see SECURITY.md)
- Staging / cutover: `docs/STAGING.md`, `docs/CUTOVER.md`
- Release scope: `docs/RELEASE_SCOPE.md`
- Migrations: `supabase/migrations/README.md` (baseline + hardening chain)
