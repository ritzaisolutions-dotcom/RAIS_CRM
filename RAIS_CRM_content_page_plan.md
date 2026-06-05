# Plan: Content-Seite im RAIS CRM Hub

## Context

Das RAIS CRM wächst über ein reines Kontakt-CRM hinaus — es wird zum zentralen Hub für alle RAIS-Aktivitäten. Kevin baut eine persönliche Marke auf (YouTube: kevin_ritz, X: kevin_ritz, Instagram: kevin_ritz1) und braucht eine einfache Möglichkeit, seinen Content zu planen und zu tracken — ohne eine separate App öffnen zu müssen.

Das bestehende Eckstein Podcast CMS (Next.js, Drizzle, Vercel) ist mit Florian gebaut und zu komplex für diesen Zweck. Diese neue Seite ist eine deutlich schlankere Variante, eingebettet direkt ins CRM — gleiche Architektur, gleiche Supabase-DB, keine neuen Build-Steps.

---

## Anforderungen

**Plattformen:** YouTube · Instagram · X  
**Content-Typen:** LFC (Long Form) · SFC (Short Form) · Article  
**Felder pro Stück:** Titel, Typ, Plattform(en), Status, Veröffentlichungsdatum, URL, Notiz  
**Status-Pipeline:** `idee` → `skript` → `dreh` → `schnitt` → `live`  
**Übersicht:** Gesamt-Counter nach Typ + gesamt Live  

---

## Datenbank — Supabase

**Neue Tabelle: `crm_content`** (im gleichen Supabase-Projekt wie `crm_contacts`)

```sql
create table crm_content (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  type        text not null check (type in ('lfc', 'sfc', 'article')),
  status      text not null default 'idee'
                check (status in ('idee', 'skript', 'dreh', 'schnitt', 'live')),
  platforms   text not null default 'youtube',  -- komma-separiert: 'youtube,instagram'
  publish_date date,
  url_youtube text,
  url_instagram text,
  url_x       text,
  notiz       text,
  created_at  timestamptz default now()
);

-- RLS: gleiche Policy wie crm_contacts (authenticated read/write)
alter table crm_content enable row level security;
create policy "auth users" on crm_content for all using (auth.role() = 'authenticated');
```

> Kevin führt dieses SQL einmalig im Supabase SQL Editor aus.

---

## Implementierung

### 1. `src/content.js` — neues Modul (neu erstellen)

Struktur analog zu `src/clients.js`:

```
- Konstanten: TYPE_LABELS, STATUS_LABELS, PLATFORM_ICONS
- Lazy-init: window.addEventListener('rais:page-change', e => { if e.detail.page === 'content') initContentPage() })
- loadContent()       → sbGet('crm_content?select=*&order=created_at.desc')
- renderContent()     → füllt #content-list + #content-stats
- openContentAdd()    → zeigt Add-Modal
- openContentEdit(id) → befüllt Modal mit vorhandenen Daten
- saveContent()       → sbUpsert('crm_content', payload) 
- delContent(id)      → sbDelete('crm_content', id) mit confirm()
- filterContent()     → client-side Filter nach Typ / Status / Plattform
- export: initContentPage, renderContent, openContentAdd, openContentEdit, saveContent, delContent, filterContent
```

**UI-Aufbau in #page-content:**
```
[Stats-Bar]  LFC: N  SFC: N  Article: N  |  ✅ Live: N  📝 Gesamt: N
[Toolbar]    [+ Neuer Content]  [Filter: Typ ▾] [Filter: Status ▾] [Filter: Plattform ▾]
[Tabelle]    Titel | Typ | Plattform | Status-Badge | Datum | Links | ⋮ (Bearbeiten/Löschen)
[Modal]      Titel*, Typ*, Plattform(n) (Checkboxen), Status*, Datum, URL je Plattform, Notiz
```

**Status-Badges** (farbig, analog zu Prospecting-Status):
- `idee` → grau
- `skript` → blau  
- `dreh` → orange
- `schnitt` → lila
- `live` → grün

**Plattform-Icons:** 🎬 YouTube · 📸 Instagram · 🐦 X

### 2. `src/sidebar.js` — PAGES-Array erweitern

```js
// Zeile 3–9 — neuen Eintrag hinzufügen:
{ id: 'content', icon: '🎬', label: 'Content' },
```

Position: nach `clients` (zweiter Eintrag), da es zum Hub-Konzept gehört.

### 3. `index.html` — 3 Änderungen

**a) Page-Container** (nach `#page-clients`, vor `#page-termine`):
```html
<div class="rais-page" id="page-content">
  <main>
    <div id="content-stats" class="content-stats-bar"></div>
    <div class="content-toolbar">
      <button onclick="openContentAdd()" class="rais-btn-primary">+ Neuer Content</button>
      <select id="content-filter-type" onchange="filterContent()">...</select>
      <select id="content-filter-status" onchange="filterContent()">...</select>
      <select id="content-filter-platform" onchange="filterContent()">...</select>
    </div>
    <div id="content-list"></div>
    <!-- Add/Edit Modal (hidden) -->
    <div id="content-modal" class="rais-modal" style="display:none">...</div>
  </main>
</div>
```

**b) Mobile-Nav-Button** (in `<nav id="mobile-nav">`):
```html
<button class="mn-tab" data-page="content">
  <span class="mn-tab-icon">🎬</span>
  <span class="mn-tab-label">Content</span>
</button>
```

**c) Import + window-Expose** (im `<script type="module">` Block):
```js
import { initContentPage, renderContent, openContentAdd, openContentEdit, saveContent, delContent, filterContent } from './src/content.js';

// In rais:page-change listener:
if (e.detail.page === 'content') initContentPage();

// In Object.assign(window, {...}):
initContentPage, renderContent, openContentAdd, openContentEdit, saveContent, delContent, filterContent,
```

---

## Was NICHT gebaut wird

- Keine Analytics-API-Pulls (kein YouTube-API-Key nötig) — Zahlen bleiben manuell
- Kein Lifecycle-Stepper mit visuellen Schritten (einfaches Dropdown reicht)
- Kein Kanban-Board — Tabelle genügt
- Kein Cloud-Realtime-Sync für Content (kein `realtime.js`-Hook)
- Kein separates localStorage-Caching für Content — immer fresh fetch aus Supabase

---

## Dateien die verändert werden

| Datei | Änderung |
|---|---|
| `src/sidebar.js` | +1 Eintrag in PAGES-Array |
| `index.html` | +Page-Container, +Mobile-Nav-Button, +Import, +rais:page-change-Handler, +window-Expose |
| `src/content.js` | **NEU erstellen** |

Alle anderen Dateien bleiben unberührt.

---

## Phasen

### Phase 1 — Datenbank (manuell, Kevin)

Kevin öffnet **Supabase Dashboard → SQL Editor** und führt das CREATE TABLE + RLS aus Abschnitt "Datenbank" oben aus. Danach bestätigt er, dass die Tabelle existiert.

> Kein Code-Commit — nur DB-Setup. Erst wenn Phase 1 erledigt ist, geht es weiter.

---

### Phase 2 — Sidebar + HTML-Gerüst

Ziel: Die neue Seite ist im Menü sichtbar und anklickbar, zeigt aber noch leeren Inhalt.

Änderungen:
1. `src/sidebar.js` → `content`-Eintrag in PAGES einfügen
2. `index.html` → Page-Container `#page-content` + Mobile-Nav-Button einfügen
3. `index.html` → Temporärer Platzhalter-Text im Container (`<p>Content kommt gleich...</p>`)

Verifikation: Sidebar zeigt "Content", Klick zeigt die leere Seite, `npm run validate` grün.

---

### Phase 3 — Modul `src/content.js` Grundgerüst

Ziel: Leeres Modul mit Init-Handler; Supabase-Anbindung lädt und rendert die Content-Liste (Tabelle ohne Filter/Modal).

Änderungen:
1. `src/content.js` neu erstellen mit:
   - Konstanten (TYPE_LABELS, STATUS_LABELS, PLATFORM_ICONS)
   - `initContentPage()` + `rais:page-change` Listener
   - `loadContent()` → `sbGet('crm_content?...')`
   - `renderContent()` → befüllt `#content-list` mit einfacher Tabelle (Titel, Typ, Status, Datum)
2. `index.html` → Import + `rais:page-change`-Handler + `window`-Expose

Verifikation: Seite lädt, leere Tabelle erscheint (0 Rows), kein Console-Error.

---

### Phase 4 — Add/Edit Modal + CRUD

Ziel: Content erstellen, bearbeiten und löschen; alle Felder vorhanden.

Änderungen:
1. `index.html` → Modal-HTML in `#page-content` einfügen (Titel, Typ, Plattform-Checkboxen, Status, Datum, URL je Plattform, Notiz)
2. `src/content.js` → `openContentAdd()`, `openContentEdit(id)`, `saveContent()`, `delContent(id)` implementieren
3. `index.html` → neue Funktionen in `window`-Expose ergänzen

Verifikation: Neuer Content anlegen → erscheint in Tabelle. Bearbeiten → Änderungen gespeichert. Löschen → Row weg. Status-Badge zeigt richtige Farbe.

---

### Phase 5 — Filter + Stats-Bar

Ziel: Seite ist vollständig nutzbar mit Übersicht und Filterung.

Änderungen:
1. `src/content.js` → `filterContent()` implementieren (client-side, kein neuer Fetch)
2. `index.html` → Filter-Dropdowns (Typ / Status / Plattform) in Toolbar einfügen
3. `src/content.js` → `renderStats()` implementieren → befüllt `#content-stats` mit Countern
4. `index.html` → `filterContent` in `window`-Expose ergänzen

Verifikation: Filter auf "lfc" zeigt nur LFC-Einträge. Stats-Bar zählt korrekt. `npm run validate` grün. Finaler Smoke-Test aller CRUD-Flows.

---

## Verifikation (Gesamt nach Phase 5)

1. `npm run validate` grün
2. Sidebar + Mobile-Nav zeigen "Content"
3. Stats-Bar: korrekte Zähler nach Typ + Live-Count
4. Filter nach Typ / Status / Plattform funktioniert
5. CRUD vollständig: Erstellen, Bearbeiten, Löschen
6. Status-Badges farblich korrekt
7. URLs pro Plattform werden gespeichert und angezeigt
