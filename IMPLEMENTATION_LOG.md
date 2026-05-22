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

---

## Audit — 2026-05-22 (Schritt 0.1/0.2 — Pre-Build Session Tracker)

### Dateistruktur

```
src/auth.js          (45 Zeilen)
src/calls.js         (33 Zeilen)
src/clients.js      (157 Zeilen)
src/email.js        (216 Zeilen)
src/import.js       (141 Zeilen)
src/leadgen.js      (136 Zeilen)
src/prospecting.js  (541 Zeilen)
src/realtime.js      (44 Zeilen)
src/state.js         (43 Zeilen)
src/supabase.js      (23 Zeilen)
src/sync.js         (156 Zeilen)
src/touch.js         (50 Zeilen)
src/ui.js            (37 Zeilen)
src/utils.js         (26 Zeilen)
                   ─────────────
Total:            1648 Zeilen

index.html           (533+ Zeilen)
styles.css
scripts/validate-static.js
supabase/migrations/2026-05-20_initial_schema.sql
supabase/migrations/2026-05-20_enable_rls.sql
supabase/migrations/2026-05-20_rollback_anon_policies.sql
n8n-workflows/*.json (6 Workflow-JSONs)
vercel.json          (nur {"version": 2})
package.json         (nur validate-script + sharp dep)
CLAUDE.md
brand.md
RAIS_CRM_session_tracker_plan.md
```

---

### Navigations-System (IST-Zustand)

**Wie werden Tabs gewechselt:**
- Funktion: `switchTab(name)` in `src/leadgen.js:23`
- Wird aufgerufen aus: `index.html` (onclick-Attribute auf den drei Tab-Buttons) + Keyboard-Shortcut-Logik (Hash-Init)

**CSS-Klassen:**
- Container: `<section class="tab-section" id="sec-{name}">` → `display: none`
- Aktiv: `class="tab-section active"` → `display: block`
- Buttons: `<button class="tab-nav-btn">` → `.tab-nav-btn.active` hebt aktiven Tab hervor
- `<nav class="tab-nav">` — horizontal, sticky unter dem `<header>`, `background: var(--ch)` (Charcoal)

**DOM-IDs der Seiten-Container:**
| ID | Tab |
|---|---|
| `#sec-leadgen` | Lead Gen |
| `#sec-prospecting` | Prospecting (default active) |
| `#sec-clients` | Clients |

**Was bei Tab-Switch passiert:**
- `sec-{name}` bekommt `.active`, alle anderen verlieren sie
- Tab-Button bekommt `.active` (per `btn.dataset.tab === name`)
- `location.hash = name` wird gesetzt
- Nur `leadgen` → ruft `loadLgPreview()` auf
- Nur `clients` → ruft `window.loadClients && window.loadClients()` auf
- Prospecting: kein Init-Call nötig (render() läuft beim Start)

**URL-Hash-Routing:** Ja — `location.hash` wird gesetzt. Beim Start prüft `leadgen.js` `location.hash` und ruft `switchTab()` falls `#leadgen` oder `#clients`.

**⚠️ Problem für Sidebar-Build:**
`switchTab()` sitzt aktuell in `src/leadgen.js` — zusammen mit WF-Trigger-Logik. Das neue `src/sidebar.js` muss entweder (a) `switchTab` von leadgen importieren und wrappen, oder (b) die Navigation-Logik wird aus leadgen heraus in sidebar verschoben und leadgen importiert dann von sidebar. Option (b) ist sauberer, aber ein Eingriff in leadgen.js. Option (a) ist konservativer.

---

### Status-Werte (alle gefundenen)

Definiert in `src/state.js:30–43`:

| Wert | Label (DE) | Badge-CSS-Klasse | Kontext |
|------|-----------|-----------------|---------|
| `neu` | Neu | `b-neu` | crm_contacts |
| `kein_anschluss` | Kein Anschluss | `b-ni` | crm_contacts |
| `gatekeeper` | Gatekeeper | `b-gk` | crm_contacts |
| `callback` | Callback | `b-fu` | crm_contacts |
| `email_nurture` | Email Nurture | `b-ib` | crm_contacts |
| `interessiert` | Interessiert | `b-in` | crm_contacts |
| `demo_termin` | Demo Termin | `b-te` | crm_contacts |
| `door_open` | Tür Offen | `b-do` | crm_contacts |
| `no_show` | No Show | `b-ns` | crm_contacts |
| `disqualified` | Disqualified | `b-ki` | crm_contacts |
| `gewonnen` | Gewonnen | `b-gw` | crm_contacts |
| `archiviert` | Archiviert | `b-ki` | crm_contacts |
| `aktiv` | Aktiv | — | crm_clients only |
| `pause` | Pause | — | crm_clients only |
| `abgeschlossen` | Abgeschlossen | — | crm_clients only |
| `verloren` | Verloren | — | crm_clients only |

Touch-Status (in `TSTAT`-Array für das Touch-Accordion — separate Werteliste, unabhängig vom Kontakt-Status):
`Nicht kontaktiert`, `Nicht erreicht`, `Mailbox`, `Rückruf erbeten`, `Gatekeeper`, `Interessiert`, `Termin vereinbart`, `Angebot gesendet`, `Kein Interesse`

---

### Status-Change-Funktionen

**⚠️ ZWEI Funktionen ändern den Kontakt-Status — beide müssen gehooked werden:**

#### 1. `qs(id, s)` — `src/prospecting.js:277`

```javascript
export function qs(id, s) {
  const c = S.contacts.find(function(x) { return x.id === id; });
  if (!c) return;
  if (c.status !== s) { bumpCall(); c.status_changed_at = td(); }
  c.status = s; markDirty(c); persist(); render(); pushDirty(); closeP();
  toast('Status: ' + (STATUS[s] ? STATUS[s].label : s));
}
```

- **Aufgerufen von:** Quick-Status-Buttons im Detail-Panel (`onclick="qs('...','')"` in prospecting.js:~280)
- **Caller-Anzahl:** 1 (nur aus dem generierten Detail-Panel HTML)
- **Old-Status:** lesbar als `c.status` VOR der Änderung — die `c.status !== s`-Prüfung zeigt das
- **Hook-Punkt:** Nach `c.status = s;`, before oder after `markDirty(c)` — oldStatus war `c.status` vor der Überschreibung

#### 2. `inlineST(sel)` — `src/prospecting.js:367`

```javascript
export function inlineST(sel) {
  const c = S.contacts.find(function(x) { return x.id === sel.dataset.id; });
  if (!c) return;
  const prev = c.status;
  c.status = sel.value;
  if (prev !== c.status) { bumpCall(); c.status_changed_at = td(); }
  markDirty(c);
  persist(); render(); pushDirty();
}
```

- **Aufgerufen von:** `<select onchange="inlineST(this)">` in der Tabellen-Zeile (prospecting.js:~149)
- **Caller-Anzahl:** 1
- **Old-Status:** bereits als `prev` vorhanden — kein neuer Parameter nötig
- **Hook-Punkt:** Nach `if (prev !== c.status) { ... }` — `prev` und `c.status` (new) sind beide verfügbar

**Kein circular import:** `sessions.js` wird von `prospecting.js` importiert, nicht umgekehrt. ✓

---

### Modul-Übersicht

| Datei | Hauptverantwortung | Zeilen |
|-------|-------------------|--------|
| `auth.js` | Login-Wall, Supabase Auth Session, `doLogin()` | 45 |
| `calls.js` | Tages-/Wochen-Anrufzähler in localStorage | 33 |
| `clients.js` | Clients-Tab CRUD, `loadClients`, `renderClients` | 157 |
| `email.js` | 3-Step Email-Sequence, Send-Popup, Bulk | 216 |
| `import.js` | CSV Import (flexibler Column-Matcher), CSV Export | 141 |
| `leadgen.js` | n8n-Webhooks WF1–WF3, **tab-Routing (`switchTab`)**, WF-Polling | 136 |
| `prospecting.js` | Kontaktliste, Filter, Sort, Pagination, Detail-Panel, Edit/Add/Delete | 541 |
| `realtime.js` | Supabase Realtime Subscription (`crm_contacts`) | 44 |
| `state.js` | Globaler State `S`, alle Konstanten | 43 |
| `supabase.js` | `sbGet`, `sbUpsert`, `sbDelete`, Auth-Token-Management | 23 |
| `sync.js` | `localStorage` + Supabase Sync, `pushDirty`, `load`, `persist` | 156 |
| `touch.js` | Touch-Accordion in Detail-Panel | 50 |
| `ui.js` | `sbadge`, `roib`, `fdc`, `esc`, `ir`, `toast` | 37 |
| `utils.js` | `gid`, `td`, `relAge`, `gewerkKuerzel`, `gewerkSlug` | 26 |

---

### Supabase-Tabellen

| Tabelle | Zweck | Wichtige Spalten |
|---------|-------|-----------------|
| `crm_contacts` | Haupt-Leads-Tabelle | `id` (text/nanoid), `status`, `touches` (jsonb), `synced_at`, `status_changed_at` |
| `crm_clients` | Gewonnene Kunden | `id` (uuid), `status` (aktiv/pause/...), `naechste_datum` |
| `wf_runs` | n8n Lauf-Status-Tracking | `wf`, `status` (running/done/error), `count` |
| `roi_leads` | ROI-Kalkulator Inbound | `email`, `estimated_roi`, `consent` |
| `inbound_leads` | Kontaktformular Inbound | `name`, `email`, `biggest_challenge` |

---

### localStorage Keys

| Key | Konstante | Inhalt |
|-----|-----------|--------|
| `rais_crm_v3` | `KEY` in state.js | contacts-Array (vollständig) |
| `rais_crm_calls` | `CC_KEY` in state.js | `{ "2026-05-22": 5, "w:2026-W21": 12 }` |
| `rais_crm_colvis` | hardcoded string in sync.js | `{ website, stadt, region, gewerk }` Sichtbarkeit |
| `rais_sidebar_collapsed` | (neu in Phase 1) | boolean |

---

### CSS-Variablen (bestehend — muss Sidebar anpassen)

```css
:root {
  --or: #EC6A37;   /* Orange (Primär-Akzent) */
  --orh: #F37A48;  /* Orange Hover */
  --bg: #F5F2EC;   /* Hintergrund Cloud */
  --sf: #FBF8F3;   /* Surface Warm Linen */
  --sg: #789464;   /* Sage */
  --pn: #3C5A2A;   /* Dark Pistachio */
  --ch: #2F2A24;   /* Charcoal (Text, Header-BG) */
  --st: #7B746B;   /* Stone (Muted Text) */
  --bd: #D9D1C7;   /* Border */
  --rd: #C0392B;   /* Rot */
  --yw: #A06800;   /* Gelb */
  --bl: #2C5F8A;   /* Blau */
}
```

Der bestehende Header hat `background: var(--ch)` — Sidebar sollte dasselbe oder ein dunkleres Dunkelton nutzen, kein völlig fremdes Blau.

---

### Bekannte technische Schulden / Probleme

1. **`switchTab()` ist in `leadgen.js`** — falsche Verantwortung. Die Funktion mischt Navigation (generisch) mit leadgen-spezifischem Init-Aufruf (`loadLgPreview()`). Lösung für Sidebar: entweder leadgen importiert von sidebar, oder sidebar übernimmt die Funktion vollständig und leadgen registriert einen Listener auf `rais:page-change`.

2. **`window`-Globals-Masse** — `Object.assign(window, {...})` am Ende von `index.html` mit ~45 Einträgen. Jede neue Funktion die aus HTML-`onclick` aufrufbar sein muss, muss dort eingetragen werden. Kein Selbstheilungsmechanismus.

3. **`rais_crm_colvis` ist eine hardcoded String-Konstante** (nicht in state.js exportiert). Nur in sync.js verwendet — kein echtes Problem, aber inkonsistent.

4. **Kein `supabase/migrations/`-Ordner im `.gitignore`** — alle Migrations werden committet, das ist korrekt.

5. **`interessiert` fehlt im Inline-Status-Dropdown** (prospecting.js:149–159) — der Wert existiert in `state.js:STATUS` aber ist nicht als `<option>` in der Tabellen-Dropdown-Liste. Sieht aus wie Absicht (nur per Detail-Panel setzbar), aber nicht dokumentiert.

---

### Risiken für diesen Build

| Risiko | Wahrscheinlichkeit | Mitigation |
|--------|--------------------|------------|
| `switchTab` Refactor bricht Tab-Init-Logik für leadgen/clients | Mittel | leadgen registriert `rais:page-change` Event Listener statt direkt aufgerufen zu werden |
| Sticky Header + neue Sidebar kollidieren im Layout | Mittel | Header muss `margin-left` oder `padding-left` anpassen wenn Sidebar aktiv |
| `window.Object.assign` vergessen für neue Sidebar-Funktionen | Niedrig | Checkliste im Akzeptanzkriterium |
| `onStatusChanged` Hook fehlt für `qs()` oder `inlineST()` | Niedrig | Beide Funktionen sind bekannt und einzeilig zu hooken |
| Supabase `crm_sessions`-Migration kollidiert mit bestehendem Schema | Sehr niedrig | Nur neue Tabellen, kein ALTER auf bestehende |
| `interessiert`-Status-Gap verursacht Session-Breakdown-Lücke | Niedrig | Sessions tracken alle Status — egal welche; kein Problem |

---

**Schritt 0.4 — STOP.**
Audit abgeschlossen. Warte auf explizite Freigabe von Kevin bevor Code geschrieben wird.
