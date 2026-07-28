# Supabase Auth — Release-Checkliste

Projekt Produktion: `qdywaenmojdxhfxqbvun` · Staging: separates Projekt/Branch

## Dashboard → Authentication

- [ ] **Public sign-ups disabled** (Email: Enable sign-ups = off)
- [ ] **Confirm email** aktiv (Invite-Flow)
- [ ] **Site URL** = produktive CRM-Domain (kein Wildcard)
- [ ] **Redirect URLs** nur echte Domains / Preview-URLs der App
  (kein `*`, kein fremdes Origin)
- [ ] Session / JWT-Expiry und Passwortregeln reviewt
- [ ] MFA für weitere CRM-Nutzer vorbereitet (vor zweitem Dauer-User)

## Allowlist-Betrieb

Neuer Nutzer = **zwei** Schritte:

1. Auth → Invite user (E-Mail)
2. SQL (service role / Dashboard, nicht aus der App):

```sql
INSERT INTO sales.app_users (user_id, email, notiz)
VALUES ('<auth-user-uuid>', 'user@example.com', 'Betriebsfreigabe');
```

Entzug: Zeile in `sales.app_users` löschen (JWT kann noch kurz gültig sein;
Middleware prüft `is_app_user()`).

## Exposed schemas

Settings → API → Exposed schemas enthält **`sales`**.

## Preview / Smoke (Staging-Variablen)

- [ ] Login erfolgreich (allowlisted)
- [ ] Nicht-allowlisted → kein CRM-Zugriff
- [ ] `/liste` laden, Firma anlegen, Pipeline-Status setzen, Touch sichtbar
- [ ] Redirect `?next=` nur interne Pfade (Open-Redirect-Schutz)
- [ ] Security-Header gesetzt (`next.config.ts` / Vercel)
- [ ] CSP: zuerst **report-only** auswerten; erst danach enforce

## CSP (bewusst verzögert)

Aktuell keine enforced CSP. Nach Preview-Tests Report-Only Header setzen,
Violations prüfen, dann enforce.
