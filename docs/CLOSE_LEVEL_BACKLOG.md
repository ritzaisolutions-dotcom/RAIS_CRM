# Close-level CRM backlog

In-app only (SMTP + IMAP + Vercel cron). No n8n required.

| # | Capability | Phase | Status |
|---|------------|-------|--------|
| 0 | Foundations (`source_key`, Verbindungen, env) | 0 | done |
| 1 | Outbound SMTP | 1 | done |
| 2 | Sequences cron | 2 | done |
| 3 | Session dialer Dial/Skip/Next | 3 | done |
| 4 | Interrupting reminders | 4 | done |
| 5 | Smart Views | 4 | done |
| 6 | Inbound IMAP | 5 | done |
| 7 | Bulk ops | 6 | done |
| 8 | Opportunity UX | 6 | done |
| 9 | Keyboard | 3+7 | done |
| 10 | Activity search | 7 | done |

## Env

- `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`, optional `SMTP_PORT`, `SMTP_SECURE`
- `IMAP_HOST`, `IMAP_USER`, `IMAP_PASS`, optional `IMAP_PORT`, `IMAP_FOLDER`
- `CRON_SECRET` — Bearer for `/api/cron/*`
- `SUPABASE_SERVICE_ROLE_KEY` — cron admin client (server-only)

## Key routes

- `/liste/dialen` — session power dialer over smart-view queue
- `/api/cron/sequences` — run due sequence steps + drain SMTP queue
- `/api/cron/inbound-email` — IMAP poll → email_messages + log_touch
- Einstellungen → Verbindungen / Quarantäne-Zuordnung
