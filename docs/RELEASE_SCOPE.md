# Release-Scope — Next.js CRM + Sales-Härtung

Stand: 28.07.2026 · Ziel-Branch: `release/safe-crm-cutover`

## Bewusst im Release enthalten

| Bereich | Pfade | Zweck |
|---------|-------|-------|
| Next.js App | `src/app/`, `src/components/`, `src/lib/`, `src/middleware.ts` | CRM-Oberfläche |
| Konfiguration | `next.config.ts`, `tsconfig.json`, `eslint.config.mjs`, `postcss.config.mjs`, `vercel.json` | Build & Deployment |
| Sales-Migrationen | `supabase/migrations/20260727*_sales_*`, `supabase/migrations/20260728*_*.sql` | Reproduzierbares Schema |
| Sicherheitstests | `supabase/tests/security_rls.sql` | RLS-/Integritäts-Gate |
| Staging | `supabase/config.toml`, `supabase/seed.sql` | Dedizierte Test-DB |
| CI | `.github/workflows/validate.yml`, `.github/dependabot.yml` | Verpflichtende Gates |
| Dokumentation | `docs/`, `SECURITY.md`, `PRIVACY.md`, `CLAUDE.md`, `brand.md` | Betrieb & Review |
| Assets | `public/`, `rais_logo_with_text.svg` | Branding |
| Legacy-Archiv | `archive/legacy-static/` | Historische Static-App (nicht deployed) |

## Bewusst ausgeschlossen

| Artefakt | Grund |
|----------|-------|
| `.next/`, `out/`, `*.tsbuildinfo` | Build-Output |
| `.env`, `.env.local` | Secrets |
| `supabase/.temp/` | Lokale CLI-Artefakte |
| `scripts/one-off/`, `scripts/ruixen-*` | Lokale Einmal-Tools / PII-Risiko |
| `scripts/hausverwaltungen-import*` | Import-Artefakte mit PII |
| Alte Static-App (`index.html`, `src/*.js`, `styles.css`, `sw.js`) | Ersetzt durch Next.js; archiviert unter `archive/legacy-static/` |

## Legacy-Löschungen (absichtlich)

Die folgenden Dateien wurden durch die Next.js-Migration ersetzt und sind **kein** versehentlicher Datenverlust:

- `index.html`, `manifest.json`, `styles.css`, `brand-tokens.css`, `sw.js`
- `src/*.js` (alte Vanilla-JS-Module)
- `api/n8n-proxy.js`
- `scripts/validate-static.js`, `scripts/test-wf789.js`
- `IMPLEMENTATION_LOG.md`, `TECHNICAL_AUDIT_GUIDE.md`

## Review-Checkliste vor Merge

```bash
git diff --check
npm run validate
```

- [ ] Keine Secrets in `git diff`
- [ ] Keine `.next/` oder PII-Exports gestaged
- [ ] Sales-Migrationen vollständig und in Remote-Reihenfolge
- [ ] `SUPABASE_TEST_DB_URL` in GitHub Secrets (Staging, nie Produktion)
