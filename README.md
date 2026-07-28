# RAIS CRM

Auth-first cold-call CRM on Supabase schema **`sales`**.

## Routes

| Path | Purpose |
|------|---------|
| `/login` | Email/password (Supabase Auth) |
| `/liste` | Prospects (`v_call_liste`) |
| `/kunden` | Customers (`v_kunden_liste`) |
| `/firma/[companyId]` | Company detail |

## Setup

1. Expose schema `sales` in Supabase Dashboard → Settings → API → Exposed schemas.
2. Copy `.env.example` → `.env.local` and set URL + anon key.
3. Log in with an existing Auth user (e.g. Kevin).

```bash
npm install
npm run dev
```

## Rules

- Touchpoints append-only
- Never hard-delete companies — exclude or `gdpr_anonymize`
- Status / last / next touch from views only
- Never write `bundesland` / `region`
- No service-role key in the browser

See `SECURITY.md` and `PRIVACY.md` (Löschkonzept / Art.17).
