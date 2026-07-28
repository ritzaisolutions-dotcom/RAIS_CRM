# Auth & Deployment verification log

Stand: 28.07.2026

## Production DB post-checks (`qdywaenmojdxhfxqbvun`)

| Check | Result |
|-------|--------|
| `anon` USAGE on `sales` | **false** |
| `touchpoints_append_only` trigger | **present** |
| Legacy `authenticated_all` policies | **0** |
| Sales policy count | **18** |
| RPCs: create_company, set_pipeline_status, upsert_person_atomic, gdpr_anonymize, log_touch, analytics_dashboard, is_app_user | **all present** |

Hardening migrations already applied remotely (`harden_sales_security_integrity`, `tighten_sales_column_privileges`).

## Auth (Dashboard — manual)

Follow [`AUTH_CHECKLIST.md`](./AUTH_CHECKLIST.md). Invite-only + `sales.app_users` remain mandatory.

## Deployment

- Vercel team `ritzaisolutions-6158s-projects` currently has **no** CRM project linked from this workspace.
- Preview smoke against staging env vars is blocked until:
  1. Staging DB exists (see `STAGING.md` — free-project limit / Docker Desktop)
  2. Vercel project is created/imported with staging env vars
- App headers are configured in `next.config.ts` (+ optional `CSP_REPORT_ONLY=1`).

## Abbruchkriterien vor Production App-Cutover

- [ ] Staging RLS suite green (`SUPABASE_TEST_DB_URL`)
- [ ] Preview smoke complete
- [ ] Auth checklist complete
- [ ] Backup verified (`CUTOVER.md`)
