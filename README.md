# RAIS CRM

Statisches Sales-CRM (PWA) für Kaltakquise, Netzwerk, Clients und Sessions.

## Stack

- **Frontend:** Vanilla ES2020-Module, `index.html` + `src/`
- **Hosting:** Vercel (kein Build-Step)
- **Datenbank:** Supabase (Auth, REST, Realtime)
- **Automation:** n8n (`n8n-workflows/`)

## Lokal starten

```bash
npx serve .
npm run validate   # vor Push
```

## Deployment

1. Push zu Git → Vercel deployed statische Dateien + `api/n8n-proxy.js`
2. Env in Vercel: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `N8N_PROXY_SECRET`
3. Supabase-Migrationen manuell anwenden (`supabase/migrations/`)
4. n8n-Workflows aus `n8n-workflows/` importieren und Credentials setzen

## Seiten

Dashboard · Netzwerk · Prospects · Clients · Sessions

## Weitere Docs

- [CLAUDE.md](CLAUDE.md) — Entwickler-Handbuch
- [SECURITY.md](SECURITY.md) — Sicherheit & Secrets
- [PRIVACY.md](PRIVACY.md) — Datenschutz
- [TECHNICAL_AUDIT_GUIDE.md](TECHNICAL_AUDIT_GUIDE.md) — Pre-Deploy-Checkliste
