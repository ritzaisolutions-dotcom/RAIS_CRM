# SECURITY.md — RAIS CRM (sales schema)

## Auth model

- Browser uses **anon key + user JWT** only. Never ship the service-role key in client bundles.
- Schema: **`sales`** must be listed under Dashboard → Settings → API → **Exposed schemas**.
- Client: `createClient(URL, KEY, { db: { schema: 'sales' } })`.
- A valid login alone is insufficient. Every application policy uses
  `(SELECT sales.is_app_user())`; membership is maintained operationally by an
  administrator in `sales.app_users`.
- `anon` has no `sales` schema usage. Authenticated users cannot read or mutate
  `sales.app_users`.
- Middleware fails closed if Supabase configuration or the allowlist check is
  unavailable.

Operational Auth checklist: [`docs/AUTH_CHECKLIST.md`](docs/AUTH_CHECKLIST.md).

## Grant and RLS matrix

| Relation | Authenticated app user |
|---|---|
| `companies` | SELECT plus selected INSERT/UPDATE columns; never DELETE |
| `people` | SELECT/DELETE plus selected INSERT/UPDATE columns |
| `touchpoints` | SELECT plus selected INSERT columns; trigger also rejects UPDATE/DELETE |
| `opportunities` | SELECT plus selected INSERT/UPDATE columns; never DELETE |
| Audit/reference tables | SELECT only |
| Views | SELECT only, `security_invoker = true` |
| `app_users`, `legacy_contacts`, unused internals | no direct application access |

Pipeline changes, company plus optional decision maker, and decision-maker
switches use atomic RPCs. Privileged RPCs check `sales.is_app_user()` inside
the database and use a fixed empty `search_path`.

## Secrets

| Secret | Where | In Git? |
|--------|--------|---------|
| Supabase anon / publishable key | `NEXT_PUBLIC_SUPABASE_*` | OK (public, RLS protects) |
| Supabase service role | Server/ops only | **Never** |
| Auth user password | Dashboard / password manager | **Never** |
| `SUPABASE_TEST_DB_URL` | GitHub Actions / local | **Never** (staging only) |

## Sales contract (frontend)

1. `touchpoints` are **append-only** — no UPDATE/DELETE from the UI.
2. Companies are **never hard-deleted** — set `relationship = 'Ausgeschlossen'` or run Art.17 anonymize.
3. Status / ICP / last / next touch come from **views** (`v_call_liste`, `v_kunden_liste`, `v_company_status`) — do not invent client-side status.
4. Never write `bundesland` or `region` (derived from `stadt`).

Editable company fields only: `name`, `stadt`, `telefon`, `website`,
`instagram_url`, `facebook_url`, `mitarbeiterzahl`, `crm_system`,
`anfragen_pro_woche`, `inserate_aktiv`, `relationship`. Pipeline status is
changed only through `sales.set_pipeline_status(...)`.

## GDPR / Art. 17 (exceptional)

See **PRIVACY.md** Löschkonzept. Daily CRM shows full names. Hard delete of companies is blocked by append-only touchpoints (`ON DELETE RESTRICT`). Use `sales.gdpr_anonymize(company_id)` only for erasure requests.

The function is allowlist-protected and transactional. Its privileged path may
only redact `touchpoints.notiz`; normal users still cannot update or delete
touchpoints.

## Browser and Supabase Auth operations

- Production sends HSTS, frame denial, MIME-sniffing protection, a strict
  referrer policy, COOP and a restrictive permissions policy.
- CSP is report-only when `CSP_REPORT_ONLY=1`; do not enforce until Preview
  evaluation is clean (see Auth checklist).
- Supabase Auth must remain invite-only: disable public email sign-up, keep Site
  URL and redirect allowlist minimal, and review password/session policy after
  adding users. Enable MFA before granting further users access.
- Login errors are generic and `next` redirects accept only internal relative
  paths.

## Backup / restore

This Supabase project is shared with non-sales data (e.g. trackers, cookie consents). Without PITR / isolated schema restore, a restore is **not surgical** to `sales` alone — document restores carefully.

Cutover / rollback: [`docs/CUTOVER.md`](docs/CUTOVER.md).
Staging: [`docs/STAGING.md`](docs/STAGING.md).

## Verify RLS

```sql
SELECT tablename, policyname, roles, cmd
FROM pg_policies
WHERE schemaname = 'sales'
ORDER BY tablename;
```

Expect operation-specific policies using `(SELECT sales.is_app_user())`; there
must be no `authenticated_all`, no duplicate permissive policy and no anon
sales access.

## Automated checks

- `npm run validate`: typecheck, lint, unit tests and production build
- `npm run security:audit`: production dependency advisories
- `npm run test:rls`: requires `SUPABASE_TEST_DB_URL` (fails if missing or production)
- CI: typecheck, lint, test, audit, build, Gitleaks, RLS suite (mandatory)
- Dependabot: weekly npm + monthly GitHub Actions
- Never configure `SUPABASE_TEST_DB_URL` with the production database URL
