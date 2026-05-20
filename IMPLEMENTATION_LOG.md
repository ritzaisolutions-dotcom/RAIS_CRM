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

---

## [2026-05-20] Phase 2 — Sync-Stabilität ✓

**Status:** ✓ Abgeschlossen

- `syncInProgress` Lock verhindert parallele Syncs
- `pushDirty()` ersetzt 10s-Debounce-Timer für sofortiges lokales Pushen
- `handleRealtimeChange()` verarbeitet INSERT/UPDATE/DELETE aus Supabase Realtime
- `initRealtime()` abonniert `crm_contacts` via `@supabase/supabase-js@2` CDN
- Supabase Realtime für `crm_contacts` aktiviert via `ALTER PUBLICATION supabase_realtime ADD TABLE public.crm_contacts`

---

## [2026-05-20] Phase 3 — Modularisierung ✓

**Status:** ✓ Abgeschlossen — index.html 1984 → 533 Zeilen (−73%)

14 ES Module in `src/`:

| Modul | Inhalt |
|-------|--------|
| `auth.js` | Login-Wall |
| `state.js` | Shared State + Konstanten |
| `supabase.js` | sbGet / sbUpsert / sbDelete |
| `utils.js` | gid, td, relAge, GKUERZEL/GSLUG |
| `ui.js` | sbadge, roib, fdc, esc, ir, toast |
| `sync.js` | syncCloud, pushDirty, load, persist |
| `realtime.js` | initRealtime, handleRealtimeChange |
| `prospecting.js` | render, getList, openP, alle Inline-Handler |
| `calls.js` | Anruf-Counter (bumpCall, renderCalls) |
| `touch.js` | Touch-Accordion (saveTF, addTouch) |
| `import.js` | CSV Import + Export |
| `email.js` | Email-Tracking, Send-Popup, Bulk-Email |
| `leadgen.js` | n8n Webhooks, Lead-Preview, Tab-Routing |
| `clients.js` | Client-CRM |

---

## [2026-05-20] Phase 4 — Schema-Versionierung & n8n-Konsistenz ✓

**Status:** ✓ Abgeschlossen

- `supabase/migrations/2026-05-20_initial_schema.sql` — vollständiger Schema-Snapshot aller 5 Tabellen
- `supabase/migrations/README.md` — Anleitung für neue Migrations
- `n8n-workflows/` erstellt (umbenannt von `supabase workflows/` — Spaces in Pfaden entfernt)
- `n8n-workflows/SCHEMA_MAP.md` — alle Spalten mit schreibendem Workflow dokumentiert
- `n8n-workflows/README.md` — Anleitung für Import, Export und Versionierung

**Wichtig:** Der alte Ordner `supabase workflows/` existiert noch lokal (untracked).
Kevin kann ihn manuell löschen oder wir lassen ihn stehen — Inhalt ist identisch mit `n8n-workflows/`.
