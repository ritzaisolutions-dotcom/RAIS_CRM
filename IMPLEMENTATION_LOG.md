# RAIS CRM — Implementation Log

---

## [2026-05-20] Phase 1.1 — Backup-Vorbereitung

**Status:** ✓ Teilweise abgeschlossen (was automatisch möglich war)

- `backups/` Verzeichnis angelegt
- `backups/` in `.gitignore` eingetragen (wird nicht ins Repo committed)
- Schema-DDL via Supabase MCP ausgelesen und dokumentiert

**Manuell noch offen (Kevin):**
- Supabase Dashboard → Database → Backups → "Create manual backup" klicken
- Optional: `npx supabase db dump --db-url <db-connection-url> > backups/2026-05-20_pre_rls.sql`
  - Connection URL steht unter: Supabase Dashboard → Settings → Database → Connection string

---

## [2026-05-20] Phase 1.3 — RLS Migration vorbereitet (NOCH NICHT AKTIVIERT)

**Status:** ⏸ Bereit — Aktivierung wartet auf Phase 1.2 + 1.4

**Befund (aktueller Zustand):**
| Table | Policy | Rollen | Problem |
|-------|--------|--------|---------|
| `crm_contacts` | `anon_all` | anon — ALL | 🚨 Jeder kann lesen/schreiben/löschen |
| `crm_clients` | `anon full access` | anon — ALL | 🚨 Jeder kann lesen/schreiben/löschen |
| `wf_runs` | `anon read/write` | anon — ALL | 🚨 Jeder kann lesen/schreiben/löschen |
| `inbound_leads` | `anon insert only` | anon — INSERT | ✓ Okay für öffentliches Formular |
| `roi_leads` | diverse | anon INSERT / auth SELECT | ✓ Korrekt konfiguriert |

**Migration-Datei erstellt:**
- `supabase/migrations/2026-05-20_enable_rls.sql` — ersetzt anon-Policies durch `authenticated`-only
- `supabase/migrations/2026-05-20_rollback_anon_policies.sql` — Notfall-Rollback

**⚠️ KEVIN ENTSCHEIDET — Reihenfolge für Aktivierung:**
1. Supabase Dashboard → Authentication → Providers → Email aktivieren
2. Supabase Dashboard → Authentication → Users → User `kevin@ritz-ai.solutions` anlegen
3. n8n Workflows (WF1–WF6): `sb_key` durch Service Role Key ersetzen (sonst bricht n8n)
4. DANN: Migration via Supabase Dashboard SQL Editor ausführen:
   ```sql
   -- Inhalt von: supabase/migrations/2026-05-20_enable_rls.sql
   ```
5. Test: `curl https://qdywaenmojdxhfxqbvun.supabase.co/rest/v1/crm_contacts -H "apikey: <anon-key>"` → muss leer/forbidden sein

---

## [2026-05-20] Phase 1.5 — Webhook-Token Frontend (n8n-Seite ausstehend)

**Status:** ✓ Frontend-Teil fertig — n8n-Seite wartet auf Kevin

**Was gemacht wurde:**
- Token generiert: `ESyfcQbQHy5sFFJBRsmPJSPIs1-87jQw7zCGHetsGpc`
- `WH_TOKEN` Konstante in `index.html` eingebaut
- Hilfsfunktion `whFetch()` erstellt — setzt `X-RAIS-Token` Header automatisch
- Alle 5 Webhook-Fetch-Calls auf `whFetch()` umgestellt (WF1, Email1-Gen, Email1-Send, Email2/3-Batch, Bulk-Email)

**Manuell noch offen (Kevin — n8n Dashboard):**
Für jeden der 6 Webhooks in WF1–WF6:
- n8n → Workflow öffnen → Webhook Node → "Authentication" → "Header Auth"
- Header Name: `X-RAIS-Token`
- Header Value: `ESyfcQbQHy5sFFJBRsmPJSPIs1-87jQw7zCGHetsGpc`

**Wichtig:** Solange n8n den Token noch nicht prüft, funktioniert alles weiter wie bisher.
Der Token-Check kann aktiviert werden wann Kevin will — unabhängig von Phase 1.2/1.3.

---

## Noch ausstehend (Kevin muss ran)

| Phase | Was | Warum Claude es nicht kann |
|-------|-----|---------------------------|
| 1.1 | Supabase Manual Backup | Nur über Dashboard UI |
| 1.2 | Supabase Email Auth aktivieren | Dashboard-Aktion |
| 1.2 | User anlegen | Dashboard-Aktion + Passwort setzen |
| 1.2 | Frontend Login-Wall auf Supabase Auth umbauen | Abhängig von 1.2 Dashboard-Setup |
| 1.4 | n8n Service Role Key | n8n Credentials nicht erreichbar |
| 1.3 | Migration AKTIVIEREN | Abhängig von 1.4 (n8n) und 1.2 (Auth) |
| 1.5 | Token in n8n eintragen | n8n Dashboard |

---

## Nächster Schritt nach Kevins Rückkehr

1. Supabase Dashboard: Email Auth aktivieren + User anlegen (10 Min)
2. n8n: Service Role Key in alle WF1–WF6 Credentials (20 Min)  
3. Migration ausführen (2 Min)
4. n8n: Webhook Token eintragen (10 Min)
5. Test: CRM durchklicken, WF1 triggern → Phase 1 abgehakt

Phase 2 (Sync-Lock + Realtime) kann danach sofort folgen.
