# RAIS CRM — Build Plan: Sidebar Navigation + Cold Call Session Tracker
**Für Claude Code. Lies dieses Dokument vollständig bevor du irgendetwas tust.**

---

## Kontext

RAIS CRM ist ein internes Cold-Calling-Tool von Kevin Ritz / RAIS. Es verwaltet Leads,
trackt Statusänderungen und triggert n8n-Workflows. Stack: Vanilla JS ES Modules,
Supabase (REST + Realtime + Auth), deployed auf Vercel.

Dieses Dokument beschreibt zwei neue Features:
1. Navigation von horizontalen Tabs → aufklappbare Left Sidebar (4 Einträge)
2. Cold Call Session Tracker (Timer + Live-Counter + History-Seite)

**Philosophie für diesen Build:**
- Konservativ. Technisch sauber. Lieber länger als kaputt.
- Jede Phase ist ein eigener Branch. Nichts geht in `main` ohne manuelle Review.
- Bei Unsicherheit: STOP. Dokumentieren. Fragen. Nicht raten.
- Bestehende Funktionalität hat Vorrang vor neuem Feature.

---

## PFLICHT: Vor dem ersten Code-Commit

### Schritt 0 — Audit BEREITS ABGESCHLOSSEN ✓

Der vollständige Projekt-Audit wurde am 2026-05-22 durchgeführt und von Kevin freigegeben.
Die Ergebnisse sind in `IMPLEMENTATION_LOG.md` (Abschnitt "Audit 2026-05-22") dokumentiert.

**Du musst den Audit NICHT wiederholen.** Lies stattdessen:
1. `IMPLEMENTATION_LOG.md` — vollständig, besonders den Audit-Abschnitt
2. `src/prospecting.js` — vollständig (541 Zeilen) — du wirst dort hooken
3. `src/leadgen.js` — vollständig (136 Zeilen) — `switchTab` wird hieraus entfernt
4. `src/state.js` — die STATUS-Konstante und alle Status-Werte
5. `styles.css` — CSS-Variablen und bestehendes Design-System

**Bekannte Fakten aus dem Audit (nicht nochmal suchen):**

- Status-Change-Funktionen: `qs()` (Zeile 277) und `inlineST()` (Zeile 367) in prospecting.js
- `switchTab()` sitzt aktuell in `leadgen.js` — wird in Phase 1 nach sidebar.js verschoben
- localStorage-Keys: `rais_crm_v3`, `rais_crm_calls`, `rais_crm_colvis`
- CSS-Variablen: `--ch` (Charcoal) für Header/Sidebar-BG, `--or` Orange Akzent
- `window.Object.assign` Block in index.html mit ~45 Einträgen
- Supabase-Tabellen: `crm_contacts`, `crm_clients`, `wf_runs`, `roi_leads`, `inbound_leads`
- RLS: noch auf anon (Migration vorbereitet aber nicht aktiviert) — nicht dein Problem hier
- Realtime: aktiv auf `crm_contacts` ✓

---

## Phase 1 — Left Sidebar Navigation

**Branch:** `feat/sidebar-nav`

### 1.1 — Bekannte Tab-Logik (aus Audit)

Aus dem Audit bereits bekannt — nicht nochmal suchen:

- Tab-Wechsel-Funktion: `switchTab(name)` in `src/leadgen.js`
- CSS-Klasse aktiv: `.active` auf `sec-{name}` Containern und Tab-Buttons
- Seiten-Container-IDs: `sec-prospecting`, `sec-leadgen`, `sec-clients`
- URL-Hash: `location.hash = name` wird bei Switch gesetzt
- leadgen-Init: `loadLgPreview()` wird bei Switch zu leadgen aufgerufen
- clients-Init: `window.loadClients && window.loadClients()` bei Switch zu clients
- Prospecting: kein Init-Call nötig (render() läuft beim Start)

**Nach der Migration heißen die Container:** `page-prospecting`, `page-leadgen`, `page-clients`, `page-sessions`
(Präfix ändert sich von `sec-` zu `page-` für Klarheit — prüfe ob `sec-` irgendwo hardcoded referenziert wird außer in switchTab selbst)

### 1.2 — Ziel-Navigationsstruktur

```
[Sidebar]
├── 📋  Prospecting        → page: 'prospecting'
├── ⚡  Lead Generation    → page: 'leadgen'
├── 👥  Clients            → page: 'clients'
└── 🏁  Sessions           → page: 'sessions'   (neu — Seite kommt in Phase 2)
```

### 1.3 — Neues Modul: `src/sidebar.js`

```javascript
// Verantwortlichkeiten:
// - Sidebar-HTML rendern (oder an bestehendes HTML binden)
// - Navigation zwischen Seiten
// - Collapsed/Expanded State

const SIDEBAR_KEY = 'rais_sidebar_collapsed';

const PAGES = [
  { id: 'prospecting',  icon: '📋', label: 'Prospecting'      },
  { id: 'leadgen',      icon: '⚡', label: 'Lead Generation'  },
  { id: 'clients',      icon: '👥', label: 'Clients'          },
  { id: 'sessions',     icon: '🏁', label: 'Sessions'         },
];

// navigateTo(pageId: string): void
// getCurrentPage(): string
// initSidebar(): void
// toggleCollapse(): void
```

**Regeln für dieses Modul:**
- Keine direkte DOM-Manipulation von anderen Modulen aus — nur über `navigateTo()`
- Beim Seitenwechsel: alten Container ausblenden, neuen einblenden
- `navigateTo()` feuert ein Custom Event `'rais:page-change'` mit `detail: { page }`,
  damit andere Module reagieren können ohne direkte Abhängigkeit
- Default-Seite beim Start: `'prospecting'`

### 1.4 — HTML-Änderungen in `index.html`

**Was wird geändert:**

1. Bestehende Tab-Bar (`<nav>`, `<ul class="tabs">` o.ä.) → entfernen
2. Neues `<nav id="rais-sidebar">` direkt nach dem Login-Wall-Container einfügen
3. Alle Seiten-Container bekommen einheitliche Klasse: `class="rais-page"` + `id="page-{name}"`
4. Haupt-Content-Wrapper bekommt `id="rais-content"` für margin-left Anpassung

**Was NICHT geändert wird:**
- Inhalt der Seiten-Container
- Auth/Login-Wall HTML
- Alle `id`-Attribute von existierenden UI-Elementen

### 1.5 — CSS

Neues `<style>`-Block oder neue Datei `sidebar.css` (je nach aktuellem CSS-Setup):

```css
/* Sidebar Grundstruktur — nutzt bestehendes Design-System */
#rais-sidebar {
  position: fixed;
  top: 0; left: 0; bottom: 0;
  width: 200px;
  background: var(--ch);   /* Charcoal — gleiche Farbe wie Header */
  display: flex;
  flex-direction: column;
  transition: width 0.2s ease;
  z-index: 100;
  overflow: hidden;
}

#rais-sidebar.collapsed {
  width: 52px;
}

#rais-content {
  margin-left: 200px;
  transition: margin-left 0.2s ease;
}

#rais-content.sidebar-collapsed {
  margin-left: 52px;
}

/* Nav Items — nutzt --or (Orange) als Akzent */
.rais-nav-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  cursor: pointer;
  color: var(--bd);          /* Border-Grau als ruhiger Text */
  white-space: nowrap;
  transition: background 0.15s, color 0.15s;
}

.rais-nav-item:hover {
  color: var(--sf);          /* Warm Linen */
}

.rais-nav-item.active {
  color: var(--or);          /* Orange Akzent */
  border-left: 3px solid var(--or);
}

/* Labels ausblenden wenn collapsed */
#rais-sidebar.collapsed .rais-nav-label {
  opacity: 0;
  pointer-events: none;
}

/* Seiten */
.rais-page { display: none; }
.rais-page.active { display: block; }

/* Toggle Button */
#sidebar-toggle {
  padding: 16px;
  cursor: pointer;
  color: #64748b;
  font-size: 18px;
  user-select: none;
  border-bottom: 1px solid #1e293b;
}

/* Mobile */
@media (max-width: 768px) {
  #rais-sidebar { width: 52px; }
  #rais-sidebar.mobile-open { width: 200px; }
  #rais-content { margin-left: 52px; }
}
```

**Alle weiteren Farben aus dem bestehenden CSS-Variablen-Set — keine neuen Werte erfinden.**

### 1.6 — Migration der bestehenden Tab-Logik

**ENTSCHEIDUNG (Kevin, 2026-05-22): Option B — `switchTab()` wandert in `sidebar.js`.**

Begründung: `switchTab()` ist eine globale Navigationsfunktion und hat in `leadgen.js`
nichts verloren. leadgen.js wird auf das `rais:page-change` Custom Event umgestellt.

**Konkrete Schritte:**

1. `switchTab()` vollständig aus `leadgen.js` entfernen und in `sidebar.js` integrieren
   (als interner Mechanismus von `navigateTo()` — kein separater Export nötig)

2. `leadgen.js` registriert einen Listener beim Modul-Init:
   ```javascript
   window.addEventListener('rais:page-change', (e) => {
     if (e.detail.page === 'leadgen') loadLgPreview();
   });
   ```

3. `clients.js` analog:
   ```javascript
   window.addEventListener('rais:page-change', (e) => {
     if (e.detail.page === 'clients') window.loadClients && window.loadClients();
   });
   ```

4. Hash-Routing (`location.hash`): `navigateTo()` setzt `location.hash = pageId`.
   Beim Start liest `sidebar.js` `location.hash` und navigiert entsprechend.
   leadgen.js und clients.js entfernen ihre eigenen Hash-Checks — sidebar.js übernimmt.

5. `window.Object.assign`-Block in `index.html`: prüfe ob `switchTab` dort eingetragen
   ist und entferne den Eintrag. Sidebar-Funktionen brauchen keinen window-Eintrag
   (sidebar.js mounted eigene Event-Listener direkt im Init).

**`window`-Globals-Warnung:**
Das CRM nutzt `Object.assign(window, {...})` für onclick-Handler (~45 Einträge).
**Session-Panel-Buttons werden NICHT über diesen Mechanismus eingehängt.**
`sessions.js` baut das Panel-HTML selbst und setzt alle Event-Listener via
`addEventListener` direkt im `initSessionPanel()` — kein window-Eintrag nötig,
kein innerHTML-onclick. Das ist konsistent mit einem eigenständigen Widget-Pattern
und bricht den window-Globals-Trend nicht weiter auf.

### 1.7 — Akzeptanzkriterien Phase 1

Teste jeden Punkt manuell bevor du den Branch mergst:

- [x] Sidebar sichtbar nach Login
- [x] Alle 4 Nav-Einträge vorhanden (Sessions-Seite darf leer sein)
- [x] Klick auf Nav-Item wechselt korrekt die Seite
- [x] Aktiver Eintrag visuell hervorgehoben
- [x] Collapse-Toggle funktioniert — nur Icons sichtbar wenn collapsed
- [x] Collapsed-State überlebt Page-Reload (localStorage)
- [x] Alle 3 bestehenden Seiten funktionieren identisch wie vor dem Refactor:
  - [x] Lead-Tabelle lädt, Filter funktionieren, Status ändern funktioniert
  - [x] WF-Trigger in LeadGen funktionieren
  - [x] Client CRM funktioniert
- [x] Keine console errors in keiner Seite
- [x] Realtime-Subscription funktioniert weiterhin (Status-Update in Tab A erscheint ohne Reload)
- [x] Mobile: Sidebar collapsed by default
- [x] Login/Logout-Flow unverändert

**Wenn einer dieser Punkte nicht passt: nicht mergen, Fix-Commit, nochmal testen.**

---

## Phase 2 — Cold Call Session Tracker

**Branch:** `feat/session-tracker`
**Basis:** `feat/sidebar-nav` (erst nach erfolgreichem Merge von Phase 1 starten)

### 2.1 — Supabase Migration

**Backup zuerst:**
```bash
npx supabase db dump --db-url <connection_string> > backups/$(date +%Y-%m-%d)_pre_sessions.sql
```

Neue Datei: `supabase/migrations/$(date +%Y-%m-%d)_create_sessions_tables.sql`

```sql
-- ============================================================
-- Session Tracker Tables
-- ============================================================

-- Haupt-Session-Tabelle
CREATE TABLE IF NOT EXISTS crm_sessions (
  id                    bigserial PRIMARY KEY,
  name                  text,
  -- Timing
  started_at            timestamptz NOT NULL DEFAULT now(),
  ended_at              timestamptz,
  paused_seconds        integer NOT NULL DEFAULT 0,       -- akkumulierte Pausen-Zeit
  duration_seconds      integer,                          -- Netto-Dauer (ohne Pausen), gesetzt bei End
  -- Konfiguration
  timer_mode            text NOT NULL DEFAULT 'free'
                        CHECK (timer_mode IN ('free', 'countdown')),
  timer_target_seconds  integer,                          -- nur bei countdown
  -- Ergebnis (denormalized für schnelle History-Abfrage)
  leads_played          integer NOT NULL DEFAULT 0,
  status_breakdown      jsonb NOT NULL DEFAULT '{}',      -- {"kein_interesse": 5, "termin": 2, ...}
  -- State
  is_active             boolean NOT NULL DEFAULT true,
  is_paused             boolean NOT NULL DEFAULT false,
  -- Ownership
  created_by            uuid REFERENCES auth.users(id),
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

-- Session Events — jede Status-Änderung während einer Session
CREATE TABLE IF NOT EXISTS crm_session_events (
  id            bigserial PRIMARY KEY,
  session_id    bigint NOT NULL REFERENCES crm_sessions(id) ON DELETE CASCADE,
  contact_id    bigint,
  contact_name  text,                  -- denormalized — Firma/Name zum Zeitpunkt des Events
  status_from   text,                  -- null wenn Lead vorher keinen Status hatte
  status_to     text NOT NULL,
  changed_at    timestamptz NOT NULL DEFAULT now()
);

-- Index für schnelle Session-Abfragen
CREATE INDEX IF NOT EXISTS idx_session_events_session_id
  ON crm_session_events(session_id);

CREATE INDEX IF NOT EXISTS idx_sessions_active
  ON crm_sessions(is_active, created_at DESC);

-- RLS — gleiche Patterns wie crm_contacts
ALTER TABLE crm_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_session_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_full_sessions"
  ON crm_sessions FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

CREATE POLICY "authenticated_full_session_events"
  ON crm_session_events FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- updated_at Trigger
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER sessions_updated_at
  BEFORE UPDATE ON crm_sessions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
```

**Rollback-Migration direkt danach:**
`supabase/migrations/$(date +%Y-%m-%d)_rollback_sessions.sql`

```sql
DROP TABLE IF EXISTS crm_session_events;
DROP TABLE IF EXISTS crm_sessions;
DROP FUNCTION IF EXISTS update_updated_at();
```

**Migration ausführen:**
```bash
npx supabase db push
# oder manuell im Supabase Dashboard ausführen falls kein CLI-Zugang
```

**Verifizieren:**
```bash
# Prüfe ob Tabellen angelegt wurden
npx supabase db diff
```

### 2.2 — Neues Modul: `src/sessions.js`

Dieses Modul ist vollständig eigenständig. Es hat keine Abhängigkeiten außer
`src/supabase.js` (für DB-Calls) und `src/auth.js` (für User-ID).

```javascript
// src/sessions.js
//
// Verantwortlichkeiten:
// - Session starten, pausieren, fortsetzen, beenden
// - Status-Events aufzeichnen
// - Session Control Panel in der Prospecting-Seite rendern
// - Sessions History Seite rendern
//
// Exports:
//   initSessionPanel(containerEl)   — Panel in Prospecting mounten
//   initSessionsPage(containerEl)   — History-Seite rendern
//   onStatusChanged(contactId, contactName, fromStatus, toStatus)
//                                   — wird von Prospecting aufgerufen bei Status-Änderung
//   getActiveSession()              — gibt aktuelle Session zurück oder null

// --- INTERNER STATE ---
// activeSession: null | { id, startedTs, pausedAt, pausedSeconds, timerMode, targetSeconds }
// timerInterval: null | IntervalID
// Der State lebt NUR im Speicher. Kein localStorage für activeSession.
// Begründung: Eine Seite-Reload beendet die Session implizit.
// (Alternative: localStorage-Persistierung — nur implementieren wenn Kevin es explizit will)

// --- TIMER-LOGIK ---
// elapsedSeconds(): Berechnet vergangene Netto-Sekunden
//   = Math.floor((Date.now() - activeSession.startedTs) / 1000)
//     - activeSession.pausedSeconds
//     - (activeSession.pausedAt ? Math.floor((Date.now() - activeSession.pausedAt) / 1000) : 0)
//
// Countdown: targetSeconds - elapsedSeconds()
// Bei Countdown: wenn elapsed >= target → automatisch pausieren + Toast

// --- SUPABASE CALLS ---
// Alle DB-Calls über bestehende sbGet/sbUpsert/sbDelete aus supabase.js
// KEIN direktes fetch() in diesem Modul
```

**Implementierungsdetails:**

`startSession(config: { timerMode: 'free'|'countdown', targetSeconds?: number })`
→ INSERT in crm_sessions, speichert id in activeSession
→ startet setInterval(1000) für Timer-Update
→ rendert Panel

`pauseSession()`
→ speichert `pausedAt = Date.now()` im lokalen State
→ `pausedAt` wird beim nächsten `elapsed`-Aufruf eingerechnet
→ UPDATE crm_sessions SET is_paused = true (fire-and-forget, kein await)
→ stoppt Interval, Panel aktualisieren

`resumeSession()`
→ `pausedSeconds += Math.floor((Date.now() - pausedAt) / 1000)`
→ `pausedAt = null`
→ UPDATE crm_sessions SET is_paused = false (fire-and-forget)
→ Interval neu starten, Panel aktualisieren

`endSession(name?: string)`
→ Interval stoppen
→ Finales `status_breakdown` und `duration_seconds` berechnen
→ UPDATE crm_sessions SET is_active=false, ended_at=now(), name=?, duration_seconds=?, leads_played=?, status_breakdown=?
→ `activeSession = null`
→ Panel in IDLE-State rendern
→ Toast: "✅ Session gespeichert"

`onStatusChanged(contactId, contactName, fromStatus, toStatus)`
→ Wenn `activeSession === null`: return (nichts tun)
→ INSERT crm_session_events
→ Lokalen Status-Breakdown updaten: `activeSession.breakdown[toStatus] = (... || 0) + 1`
→ Panel neu rendern (Zähler + Breakdown)

### 2.3 — Session Control Panel

**Position:** Direkt über der Leads-Tabelle in der Prospecting-Seite.
Kein Floating, kein Overlay. Fester Teil des Layouts.

**HTML-Struktur:**

```html
<div id="session-panel" class="session-panel session-panel--idle">

  <!-- IDLE State -->
  <div class="sp-idle">
    <div class="sp-timer-config">
      <label>
        <input type="radio" name="timer-mode" value="free" checked> Frei
      </label>
      <label>
        <input type="radio" name="timer-mode" value="countdown"> Countdown:
        <input type="number" id="sp-countdown-min" value="90" min="1" max="480"> min
      </label>
    </div>
    <button id="sp-start-btn" class="btn-session-start">▶ Session starten</button>
  </div>

  <!-- RUNNING State -->
  <div class="sp-running" hidden>
    <div class="sp-controls">
      <button id="sp-pause-btn">⏸ Pause</button>
      <button id="sp-end-btn">⏹ Beenden</button>
    </div>
    <div class="sp-stats">
      <span class="sp-timer">00:00:00</span>
      <span class="sp-count">📞 <strong id="sp-lead-count">0</strong> gespielt</span>
    </div>
    <div id="sp-breakdown" class="sp-breakdown"></div>
    <!-- Countdown Fortschrittsbalken — nur sichtbar wenn timer_mode = 'countdown' -->
    <div id="sp-progress-wrap" hidden>
      <div id="sp-progress-bar" style="width:0%"></div>
    </div>
  </div>

  <!-- PAUSED State -->
  <div class="sp-paused" hidden>
    <div class="sp-controls">
      <button id="sp-resume-btn">▶ Fortsetzen</button>
      <button id="sp-end-btn-paused">⏹ Beenden</button>
    </div>
    <div class="sp-stats">
      <span class="sp-timer sp-timer--paused">00:00:00 ⏸</span>
      <span class="sp-count">📞 <strong id="sp-lead-count-p">0</strong> gespielt</span>
    </div>
    <div id="sp-breakdown-paused" class="sp-breakdown"></div>
  </div>

</div>
```

**State-Wechsel:** Nur die relevanten `<div>`-Sektionen ein-/ausblenden via `hidden`.
Kein innerHTML-Replace bei State-Wechsel — nur Werte updaten + hidden-Toggle.

**Breakdown-Anzeige (inline):**
```
kein_interesse: 6   nicht_erreicht: 4   termin: 2   door_open: 1
```
Als kleine `<span class="sp-badge sp-badge--{status}">` Pills.

**End-Dialog:**
Wenn "Beenden" geklickt → kleines Inline-Formular im Panel erscheint:
```
Session speichern als: [________________]   [Speichern]  [Ohne Name speichern]
```
Kein browser-`prompt()`. Kein Modal. Inline im Panel.

### 2.4 — Hook in bestehende Status-Change-Logik

**Aus dem Audit bekannt: ZWEI Funktionen in `src/prospecting.js` ändern Status.**
Beide müssen gehooked werden. Kein Parameter wird hinzugefügt — old-status ist in
beiden Funktionen bereits greifbar.

#### Hook 1: `qs(id, s)` — prospecting.js:277

```javascript
// VORHER:
export function qs(id, s) {
  const c = S.contacts.find(function(x) { return x.id === id; });
  if (!c) return;
  if (c.status !== s) { bumpCall(); c.status_changed_at = td(); }
  c.status = s; markDirty(c); persist(); render(); pushDirty(); closeP();
  toast('Status: ' + (STATUS[s] ? STATUS[s].label : s));
}

// NACHHER — nur diese 2 Zeilen hinzufügen:
export function qs(id, s) {
  const c = S.contacts.find(function(x) { return x.id === id; });
  if (!c) return;
  const _prev = c.status;                                          // NEU
  if (c.status !== s) { bumpCall(); c.status_changed_at = td(); }
  c.status = s; markDirty(c); persist(); render(); pushDirty(); closeP();
  toast('Status: ' + (STATUS[s] ? STATUS[s].label : s));
  onStatusChanged(c.id, c.firma || c.company_name, _prev, s);     // NEU
}
```

#### Hook 2: `inlineST(sel)` — prospecting.js:367

```javascript
// VORHER:
export function inlineST(sel) {
  const c = S.contacts.find(function(x) { return x.id === sel.dataset.id; });
  if (!c) return;
  const prev = c.status;
  c.status = sel.value;
  if (prev !== c.status) { bumpCall(); c.status_changed_at = td(); }
  markDirty(c);
  persist(); render(); pushDirty();
}

// NACHHER — nur diese 1 Zeile hinzufügen:
export function inlineST(sel) {
  const c = S.contacts.find(function(x) { return x.id === sel.dataset.id; });
  if (!c) return;
  const prev = c.status;
  c.status = sel.value;
  if (prev !== c.status) { bumpCall(); c.status_changed_at = td(); }
  markDirty(c);
  persist(); render(); pushDirty();
  onStatusChanged(c.id, c.firma || c.company_name, prev, c.status); // NEU
}
```

**Import am Anfang von prospecting.js hinzufügen:**
```javascript
import { onStatusChanged } from './sessions.js';
```

**Kein circular import:** sessions.js importiert nichts aus prospecting.js. ✓
**`onStatusChanged` filtert `status_to === 'neu'` intern — kein Schutz hier nötig.**

### 2.5 — Sessions History Seite (`#page-sessions`)

**Container:** `<div id="page-sessions" class="rais-page">`

**Wird initialisiert** wenn Sidebar zu `sessions` navigiert: `initSessionsPage(el)`
**Lädt Daten** aus Supabase bei jedem Aufruf (kein permanenter Cache):

```javascript
// Query:
// SELECT * FROM crm_sessions
// WHERE is_active = false
// ORDER BY started_at DESC
// LIMIT 50
```

**Layout:**

```
┌─────────────────────────────────────────────────────────────┐
│ Sessions                               [▶ Neue Session →]   │
│ (Klick navigiert zu Prospecting und startet Session-Modus)  │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  📅 Mo, 19.05.2026 · 14:02–15:25 · 01:23:14                │
│  "Koblenz Runde 1"                          [✏]             │
│  📞 28 Leads gespielt                                        │
│                                                              │
│  kein_interesse  ██████████████  12  43%                     │
│  nicht_erreicht  ████████        8   29%                     │
│  termin          █████           5   18%                     │
│  door_open       ██              2    7%                     │
│  gewonnen        █               1    4%                     │
│                                                              │
├─────────────────────────────────────────────────────────────┤
│  📅 Fr, 16.05.2026 · ...                                     │
│  ...                                                         │
└─────────────────────────────────────────────────────────────┘
```

**Balkendiagramm:** Reines CSS — keine externe Library.

```html
<div class="session-bar-row">
  <span class="sbr-label">kein_interesse</span>
  <div class="sbr-bar-wrap">
    <div class="sbr-bar sbr-bar--negative" style="width: 43%"></div>
  </div>
  <span class="sbr-count">12</span>
  <span class="sbr-pct">43%</span>
</div>
```

**Status-Farb-Gruppen — FINAL (aus Audit bestätigt, von Kevin abgenommen):**

```javascript
const STATUS_GROUPS = {
  positive: ['gewonnen', 'demo_termin', 'door_open', 'interessiert'],  // Sage --sg
  negative: ['disqualified', 'archiviert'],                             // Rot  --rd
  neutral:  ['kein_anschluss', 'gatekeeper', 'callback',
             'no_show', 'email_nurture'],                               // Gelb --yw
};
// 'neu' ist KEIN Session-Outcome und wird NICHT angezeigt.
// Begründung: Leads starten als 'neu' — ein Lead springt während oder
// nach einer Session nie ZU 'neu' zurück. 'neu' als status_to ist
// ein Datenfehler. Falls er auftaucht: ignorieren / nicht in Breakdown rendern.
// Alle unbekannten Status → neutral (Fallback, zukunftssicher).
```

**Konkret in `onStatusChanged`:**
```javascript
// Leads die bereits 'neu' sind und auf 'neu' bleiben → passiert nicht (kein Change-Event)
// Falls status_to === 'neu' → Event NICHT aufzeichnen, NICHT zählen
if (toStatus === 'neu') return;
```

**Umbenennen:**
- Klick auf [✏] → `<span>` wird zu `<input type="text">` mit aktuellem Namen
- Enter / Blur → UPDATE crm_sessions SET name = ? → span wieder anzeigen
- Escape → Abbrechen, kein Save

**Pagination:** Lade zunächst 20 Sessions. "Mehr laden"-Button wenn COUNT > 20.

### 2.6 — Akzeptanzkriterien Phase 2

Teste jeden Punkt manuell:

**Session Control Panel:**
- [x] Panel sichtbar in Prospecting-Seite (über der Tabelle)
- [x] Timer-Modus "Frei" → Panel startet, Timer zählt hoch
- [x] Timer-Modus "Countdown 90 min" → Timer zählt runter, Fortschrittsbalken
- [x] Pause → Timer friert ein, richtige Zeit gespeichert
- [x] Fortsetzen → Timer läuft weiter, keine Zeitsprünge
- [x] Status eines Leads ändern → Zähler steigt, Breakdown aktualisiert sich
- [x] Beenden → Inline-Namensfeld erscheint, Session in Supabase gespeichert
- [x] Nach Beenden: Panel zurück in IDLE-State
- [x] Countdown läuft ab → Toast erscheint, Session pausiert automatisch

**Session History:**
- [x] Navigiere zu Sessions-Seite → Sessions werden geladen
- [x] Alle gespeicherten Sessions erscheinen, neueste zuerst
- [x] Balkendiagramm korrekt prozentual
- [x] Umbenennen funktioniert, wird in Supabase gespeichert
- [x] "Neue Session" Button navigiert zu Prospecting

**Keine Regressions:**
- [x] Status-Änderung ohne aktive Session → kein Fehler, normales Verhalten
- [x] Alle Akzeptanzkriterien aus Phase 1 weiterhin erfüllt

---

## Commit-Strategie

```
# Phase 1
git checkout -b feat/sidebar-nav

feat(nav): add src/sidebar.js — page navigation, collapse toggle, localStorage state
feat(nav): replace tab bar with left sidebar in index.html
feat(nav): migrate tab-switching calls to navigateTo()
feat(nav): add sidebar CSS — collapsed/expanded, mobile breakpoint
test(nav): all pages verified functional after sidebar refactor

# Phase 2
git checkout -b feat/session-tracker

feat(sessions): create Supabase migration — crm_sessions + crm_session_events + RLS
feat(sessions): add src/sessions.js — SessionManager, startSession, pause, resume, end
feat(sessions): add Session Control Panel HTML + CSS to Prospecting view
feat(sessions): hook onStatusChanged into prospecting status-change function
feat(sessions): add Sessions history page with CSS bar charts
feat(sessions): add session rename (inline edit → Supabase UPDATE)
test(sessions): full session lifecycle verified, no regressions
```

---

## Was du NICHT tust

- Keine externen Dependencies einführen (keine Chart.js, Recharts, etc.) — CSS-only
- Kein React, TypeScript, Build-Step
- `crm_contacts` nicht droppen, umbenennen oder Schema-Breaks
- Nicht die Auth-Logik anfassen
- Nicht die Sync/Realtime-Logik refactorn (außer Audit zeigt kritischen Fehler)
- Kein `git push --force` unter keinen Umständen
- Keine spekulativen Features ("wäre cool wenn...") — nur was in diesem Dokument steht

---

## Stop-Bedingungen (immer einhalten)

Stoppe und stelle mir eine explizite Frage wenn:

1. Du dir bei einem Schema-Feldnamen nicht sicher bist (raten verboten)
2. `qs()` oder `inlineST()` sich im Code anders verhalten als im Audit dokumentiert
   (z.B. andere Zeile, anderer Funktionsname, weitere Caller gefunden)
3. Zwei Module zirkuläre Imports hätten mit deiner Lösung
4. Eine Migration Daten löschen oder umbenennen würde
5. Ein Akzeptanzkriterium nicht erfüllbar ist ohne größere Änderungen als hier beschrieben
6. `sec-` Präfix irgendwo hardcoded außerhalb von switchTab vorkommt (CSS, externe JS)

---

## Zeitplan (Orientierung)

```
Schritt 0  — Audit ✓ ABGESCHLOSSEN (2026-05-22, von Kevin freigegeben)
Phase 1    — Sidebar Nav                       → Kevin Review + Merge
Phase 2    — Session Tracker                   → Kevin Review + Merge
```

Jede Phase darf so lange dauern wie sie braucht. Kein Time-Box-Druck.
Qualität > Geschwindigkeit.
