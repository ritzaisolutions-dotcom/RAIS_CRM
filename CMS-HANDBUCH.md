# Eckstein Podcast CMS — Entwickler-Handbuch

Interne Referenz für Kevin Ritz, Florian Spieß und alle, die an diesem CMS weiterbauen oder es warten. Erklärt **wie** das System aufgebaut ist, **warum** bestimmte Entscheidungen getroffen wurden, und **worauf** bei jeder Änderung zu achten ist.

> **Kurzregeln für Agents:** Siehe [`CLAUDE.md`](../CLAUDE.md) im Repo-Root.  
> **UI-Details:** Siehe [`.cursor/skills/eckstein-ui/SKILL.md`](../.cursor/skills/eckstein-ui/SKILL.md).

---

## Inhaltsverzeichnis

1. [Einleitung & Stack](#1-einleitung--stack)
2. [Lokales Setup & Umgebungsvariablen](#2-lokales-setup--umgebungsvariablen)
3. [Architektur-Überblick](#3-architektur-überblick)
4. [Auth & Sicherheit](#4-auth--sicherheit)
5. [Datenbank](#5-datenbank)
6. [Content Hub](#6-content-hub)
7. [API-Konventionen](#7-api-konventionen)
8. [Design System — Dark Liquid Glass](#8-design-system--dark-liquid-glass)
9. [Weitere Module](#9-weitere-module)
10. [Deployment & Betrieb](#10-deployment--betrieb)
11. [Anti-Patterns & Checkliste vor Merge](#11-anti-patterns--checkliste-vor-merge)
12. [Wichtige Dateien (Index)](#12-wichtige-dateien-index)
13. [Weiterführend](#13-weiterführend)

---

## 1. Einleitung & Stack

### Zweck

Das **Eckstein Podcast CMS** ist ein internes Content-Management-System für den Podcast *Eckstein* (Kevin Ritz + Florian Spieß). Es verwaltet alle Content-Typen und deren Veröffentlichung über YouTube, Rumble, Spotify, TikTok, Instagram, X, Substack, Website und mehr — von der Idee bis zum Live-Post, inklusive Analytics, Episode Prep, Gäste-CRM und verschlüsseltem Vault.

### Stack

| Schicht | Technologie |
|---------|-------------|
| Framework | Next.js 16 (App Router) |
| Runtime | Node.js auf Vercel (Fluid Compute) |
| Datenbank | Supabase Postgres via Drizzle ORM + `postgres` npm package |
| Storage | Vercel Blob (Medien-Uploads) |
| Krypto | Web Crypto API (`crypto.subtle`) — Sessions, Vault |
| Styling | Tailwind CSS 4 + Custom Design Tokens in `app/globals.css` |
| Deploy | Vercel, Auto-Deploy bei Push auf `main` |

**Remote:** `https://github.com/ritzaisolutions-dotcom/Eckstein-Podcast-CMS.git`

### Grundprinzipien

1. **Eine Content-Tabelle** — alle Typen (`lfc`, `sfc`, `article`, `social_post`) in `content_pieces`, nicht pro Typ eine eigene Tabelle.
2. **Serverless-first** — jede Designentscheidung berücksichtigt Vercel Serverless (Connection Limits, Cold Starts, Timeouts).
3. **Single Source of Truth** — Plattform-Matrix, Lifecycle-Labels, Status-Logik jeweils in **einer** Lib-Datei.
4. **Scan → Act → Confirm** — im Content Hub kleine, sofortige Aktionen statt monolithischer Formulare.

---

## 2. Lokales Setup & Umgebungsvariablen

### Commands

```bash
pnpm install          # Dependencies
pnpm dev              # Dev-Server (localhost:3000)
pnpm build            # Production Build — MUSS vor jedem Push grün sein
pnpm lint             # ESLint

pnpm db:generate      # Drizzle-Migration aus Schema generieren
pnpm db:push          # Schema direkt pushen (nur Dev!)
pnpm db:studio        # Drizzle Studio (DB browser)
pnpm db:push-indexes  # Performance-Indizes deployen
pnpm db:seed-vault    # Vault-Seed-Daten (Dev)
```

Secrets liegen in **`.env.local`** (gitignored). Vercel-Production-Variablen werden im Vercel-Dashboard gesetzt.

### Pflicht-Umgebungsvariablen

| Variable | Zweck | Worauf achten |
|----------|-------|---------------|
| `DATABASE_URL` | Postgres-Verbindung | **Port 6543** (Transaction Pooler). Siehe [5.1](#51-connection-p0) |
| `ADMIN_PASSWORD` | Login-Passwort | Einziges Auth-Gate für das gesamte CMS |
| `SESSION_SECRET` | HMAC-Signatur für Session-Cookie | In Production stark & einzigartig; Default nur für Dev |
| `VAULT_MASTER_KEY` | PBKDF2-Ableitung für Vault-Verschlüsselung | **Verlust = unwiederbringliche Daten** |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob Upload | Für Media Library / Uploads |
| `CRON_SECRET` | Schutz der Cron-Route | Vercel setzt `Authorization: Bearer …` |
| `YOUTUBE_API_KEY` | Analytics-Pull YouTube | Optional; ohne Key kein YT-Pull |
| `IG_ACCESS_TOKEN` | Analytics-Pull Instagram | Optional |
| `TELEGRAM_WEBHOOK_SECRET` | Telegram-Bot Webhook | Nur wenn Bot aktiv |
| `TELEGRAM_ALLOWED_CHAT_IDS` | Erlaubte Chat-IDs | Komma-getrennt |

**Beispiel `DATABASE_URL` (Transaction Pooler):**

```
postgresql://postgres.[ref]:[password]@aws-1-eu-central-1.pooler.supabase.com:6543/postgres
```

> **Worauf achten:** Niemals Port **5432** (Session Pooler) in Production. Das führt sofort zu Connection-Exhaustion auf Vercel.

---

## 3. Architektur-Überblick

### Route Groups

```
app/
├── (auth)/login/          → Öffentliche Login-Seite
├── (cms)/                 → Gesamte CMS-App (geschützt)
│   ├── page.tsx           → Dashboard
│   ├── content/           → Content Hub (Kern)
│   ├── analytics/
│   ├── prep/
│   ├── guests/
│   ├── vault/
│   ├── mind-dump/
│   └── …
├── api/                   → REST-Endpoints
├── share/prep/[token]/    → Öffentlicher Prep-Share (Token-basiert)
└── design-preview/        → UI-Referenz (öffentlich)
```

Das CMS-Layout (`app/(cms)/layout.tsx`) wrappt alle geschützten Seiten in `.cms-shell` + Sidebar + Command Palette (Cmd+K).

### Legacy-Redirects

Alte URLs leiten auf den Content Hub um:

| Alt | Neu |
|-----|-----|
| `/episodes` | `/content?type=lfc` (+ Query-Params werden weitergeleitet) |
| `/episodes/[id]` | `/content/[id]` |
| `/articles`, `/newsletter` | `/content?type=article` |
| `/shorts` | `/content?type=sfc` |
| `/posts` | `/content?type=social_post` |

### Datenfluss (Content)

```mermaid
flowchart TB
  subgraph client [Browser]
    Hub["/content Hub"]
    Panel["ContentEditPanel"]
    AdvForm["EpisodeForm Advanced"]
  end
  subgraph api [API Routes]
    ContentAPI["PATCH /api/content/id"]
    PlatAPI["PATCH .../platforms/slug"]
    LifeAPI["PATCH .../lifecycle"]
  end
  subgraph lib [Shared Logic]
    Platforms["lib/platforms.ts"]
    Status["lib/content-status.ts"]
    Sync["lib/content-sync.ts"]
    HubLib["lib/content-hub.ts"]
  end
  subgraph db [Supabase Postgres]
    Pieces["content_pieces"]
    Links["content_platform_links"]
    Snaps["analytics_snapshots"]
  end
  Hub --> HubLib
  Panel --> LifeAPI
  Panel --> PlatAPI
  AdvForm --> ContentAPI
  ContentAPI --> Pieces
  ContentAPI --> Links
  PlatAPI --> Links
  Sync --> Status
  Status --> Pieces
```

### Schichten-Modell

| Schicht | Verantwortung | Beispiel |
|---------|---------------|----------|
| **Pages** (Server Components) | Daten laden, filtern, an Komponenten übergeben | `app/(cms)/content/page.tsx` |
| **Client Components** | Interaktion, PATCH-Calls, lokaler UI-State | `ContentEditPanel`, `PlatformDotRow` |
| **API Routes** | Auth, Validierung, DB-Schreiben, Cache-Invalidierung | `app/api/content/[id]/route.ts` |
| **Lib** | Business-Logik ohne HTTP | `deriveContentStatus`, `validatePlatformLinks` |
| **Schema** | Drizzle-Tabellendefinitionen | `lib/db/schema.ts` |

---

## 4. Auth & Sicherheit

### Session-Flow

```mermaid
sequenceDiagram
  participant Browser
  participant Proxy as proxy.ts
  participant Login as POST /api/auth/login
  participant API as API Routes

  Browser->>Login: password
  Login->>Browser: Set-Cookie eckstein_session
  Browser->>Proxy: Request mit Cookie
  Proxy->>Proxy: verifySessionCookie HMAC-SHA256
  alt Cookie gültig
    Proxy->>API: next()
  else Cookie fehlt/ungültig
    Proxy->>Browser: Redirect /login oder 401
  end
  API->>API: requireSession zusätzlich prüfen
```

### Middleware: `proxy.ts`

Next.js 16 nutzt `proxy.ts` als Request-Interceptor (früher `middleware.ts`). Er prüft auf **allen** Routen außer `PUBLIC_PATHS`:

```ts
const PUBLIC_PATHS = ["/login", "/api/auth", "/api/telegram", "/share", "/_next", "/favicon", "/design-preview"];
```

- **Kein Cookie** → Redirect zu `/login?from=…` (Pages) oder `401 JSON` (API)
- **Ungültige Signatur** → Cookie löschen + Redirect

Cookie-Format: `{uuid}.{hmac-sha256-hex}` — signiert mit `SESSION_SECRET`.

### API-Schutz

Jede schreibende/lesende API-Route ruft zusätzlich `requireSession(req)` aus `lib/require-session.ts` auf. Der Proxy allein reicht nicht als einzige Absicherung — doppelte Prüfung ist Absicht.

### Vault-Verschlüsselung

- Algorithmus: **AES-256-GCM** via `lib/crypto.ts`
- Format: 16-Byte Salt + 12-Byte IV + Ciphertext → Base64-Text in DB
- Key-Ableitung: PBKDF2 aus `VAULT_MASTER_KEY`
- Jeder Reveal (`POST /api/vault/reveal`) schreibt in `vault_audit_log`

> **Worauf achten:** `VAULT_MASTER_KEY` niemals rotieren ohne Migrationsplan — bestehende Einträge wären sonst nicht mehr lesbar.

### Öffentliche Endpunkte

| Pfad | Grund |
|------|-------|
| `/login` | Auth-Einstieg |
| `/share/prep/[token]` | Externer Prep-Share per Token |
| `/design-preview` | UI-Referenz / Design-Review (bewusst ohne Auth) |
| `/api/telegram/inbound` | Webhook mit eigenem Secret |
| `/api/cron/refresh-analytics` | Vercel Cron mit `CRON_SECRET` |

---

## 5. Datenbank

### 5.1 Connection (P0)

Vercel startet **viele parallele Serverless-Instanzen**. Jede Instanz öffnet eigene DB-Connections. Supabase Session Pooler (Port 5432) hält echte Postgres-Sessions — das Limit wird sofort erschöpft.

**Lösung:** Transaction Pooler (Port **6543**) multiplexed alle Requests über wenige echte Connections.

In `lib/db/index.ts`:

```ts
_client = postgres(url, {
  ssl: "require",
  max: 1,           // Eine Connection pro Serverless-Instanz
  prepare: false,   // Pflicht für PgBouncer/PgPool
  connect_timeout: 15,
  idle_timeout: 20,
  max_lifetime: 60 * 10,
});
```

**Symptome bei Fehlkonfiguration:**
- `too many connections` in Logs
- Build hängt bei `Collecting page data` (DB-Timeout beim Pre-Render)
- Intermittierende 500er unter Last

### 5.2 Server Components (P0)

Jede Page, die die DB abfragt, **muss** oben haben:

```ts
export const dynamic = "force-dynamic";
```

Ohne diese Zeile versucht Next.js, die Page beim **Build** vorzu rendern. Die DB-Verbindung läuft ins Timeout → Build hängt ewig.

**Nicht** `export const revalidate = N` auf Page-Dateien verwenden. Stattdessen Query-Level-Caching in `lib/cache.ts` via `unstable_cache`.

Schwere Pages zusätzlich:

```ts
export const maxDuration = 60;  // Vercel Function Timeout
```

### 5.3 Schema-Philosophie

#### Zentrale Tabelle: `content_pieces`

Alle Content-Typen teilen sich **eine** Tabelle mit `type`-Discriminator:

| Typ | Bedeutung |
|-----|-----------|
| `lfc` | Long Form Content (Episoden) |
| `sfc` | Short Form Content (Shorts/Clips) |
| `article` | Artikel / Das Fundament |
| `social_post` | Social Posts |

Wichtige Spalten:

| Spalte | Bedeutung |
|--------|-----------|
| `contentId` | Globaler Auto-Increment-Counter über alle Typen |
| `typeIndex` | Zähler pro Typ (z. B. LFC-3) |
| `lifecycleStage` | Produktions-Pipeline (siehe unten) |
| `status` | Publish-Status — **abgeleitet**, nicht manuell setzen |
| `filmingDate` | Drehtermin (Produktion) |
| `uploadDate` | Geplante/ tatsächliche Veröffentlichung |
| `parentId` | SFC → LFC Verknüpfung |
| `guestId` | Gast-Referenz |

#### Zwei Status-Konzepte — nicht verwechseln!

| Konzept | DB-Feld | Werte | UI-Labels | Wer setzt es? |
|---------|---------|-------|-----------|---------------|
| **Lifecycle** (Produktion) | `lifecycleStage` | `draft` → `scripting` → `filming` → `editing` → `revision` → `live` | Entwurf, Skript, Dreh, … | Nutzer via LifecycleStepper |
| **Publish-Status** | `status` | `draft`, `scheduled`, `published` | Unveröffentlicht, Geplant, Live | **Automatisch** via `syncContentStatus` |

> **Worauf achten:** „Entwurf“ im Lifecycle ≠ „Unveröffentlicht“ im Publish-Status. Gleiches deutsches Wort, verschiedene Bedeutung. Im UI heißt Publish-`draft` deshalb **„Unveröffentlicht“**.

Publish-Status wird abgeleitet in `lib/content-status.ts`:

```ts
export function deriveContentStatus(lifecycleStage, platformLinks) {
  if (lifecycleStage === "live") return "published";
  if (platformLinks.some(l => l.postedAt)) return "published";
  if (platformLinks.some(l => l.scheduledAt || l.url?.trim())) return "scheduled";
  return "draft";
}
```

#### Plattform-Links: `content_platform_links`

Composite Primary Key: `(contentId, platformId)`.

| Spalte | Zweck |
|--------|-------|
| `url` | Link zur Veröffentlichung |
| `scheduledAt` | Geplanter Post-Zeitpunkt |
| `postedAt` | Tatsächlich live (gesetzt via „Als live markieren“) |
| `externalId` | ID für Analytics-API (YouTube Video ID etc.) |

#### Analytics: `analytics_snapshots`

**Append-only.** Jeder Cron-Lauf **insertet** eine neue Zeile — nie `UPDATE`. Trend-Historie entsteht durch wiederholte Inserts.

Abfrage der **aktuellsten** Werte: `DISTINCT ON (content_id, platform_id) … ORDER BY captured_at DESC` — siehe `lib/cache.ts`.

### 5.4 Caching

`lib/cache.ts` nutzt `unstable_cache` (funktioniert **neben** `force-dynamic` auf Pages):

| Funktion | TTL | Tag |
|----------|-----|-----|
| `getCachedPlatforms()` | 1h | `platforms` |
| `getCachedContentCounts()` | 60s | `content-counts` |
| `getCachedAnalyticsSnapshots(ids)` | 5min | keyed by sorted IDs |
| `getCachedPlatformViews()` | 5min | `analytics-snapshots` |

Nach Schreiboperationen: `invalidateContentCaches()` aufrufen.

### 5.5 Performance-Patterns

1. **Scoped Analytics** — Snapshots nur für die IDs laden, die die Page braucht, nicht die ganze Tabelle.
2. **Sequential Queries auf Dashboard** — bei `max: 1` Connection lieber nacheinander als 9 parallele Queries, die sich die eine Connection teilen.
3. **Indizes** — deployen via `pnpm db:push-indexes` / `pnpm db:push-indexes-concurrent` (große `analytics_snapshots`-Tabelle).

---

## 6. Content Hub

Der Content Hub (`/content`) ist das **zentrale Arbeits-UI** — ein einziger Ort für alle Content-Typen, Board- und Tabellenansicht, Quick Create und Inline-Bearbeitung.

### 6.1 Routing

| Route | Komponente | Zweck |
|-------|------------|-------|
| `/content` | `content/page.tsx` | Hub — Board (Desktop) / Table (Mobile) |
| `/content/new` | `ContentQuickCreate` | Schnell anlegen (Slide-over) |
| `/content/[id]` | `ContentEditPanel` | Bearbeiten: Status / Details / Inhalt |
| `/content/[id]/advanced` | `EpisodeForm` | Voller Editor: SFC-LFC, Analytics-IDs, alle Felder |

### 6.2 Plattform-Matrix

**Single Source of Truth:** `lib/platforms.ts` — nirgendwo anders Plattform-Regeln duplizieren.

| Content-Typ | Erlaubte Plattformen |
|-------------|---------------------|
| `lfc` | youtube, spotify |
| `sfc` | youtube, tiktok, instagram |
| `article` | website |
| `social_post` | instagram |

API-Funktionen:
- `getPlatformsForType(type)` — UI-Matrix
- `validatePlatformLinks(type, links)` — PATCH-Validierung
- `allowedPlatformSlugs(type)` — Pruning bei Typ-Wechsel

Bei Typ-Wechsel im PATCH entfernt die API automatisch Links für nicht mehr erlaubte Plattformen (`pruneDisallowedLinks`).

### 6.3 Status-Logik — eine Wahrheit

Zwei UI-Elemente zeigen Publish-Status:

| UI-Element | Funktion | Regel |
|------------|----------|-------|
| **Platform Dots** | `platformDotState()` in `lib/content-hub.ts` | grau = off; gold = URL oder Schedule; grün = `postedAt` |
| **Status-Badge / Filter** | `deriveContentStatus()` in `lib/content-status.ts` | identische Regeln auf Piece-Ebene |

Nach **jedem** Lifecycle- oder Platform-Change: `syncContentStatus(contentId, lifecycleStage)` aufrufen — schreibt abgeleiteten `status` zurück nach `content_pieces`.

```mermaid
flowchart LR
  UserAction["Nutzer: Lifecycle / Platform / Advanced Save"]
  API["API Route"]
  DBLinks["content_platform_links"]
  Derive["deriveContentStatus"]
  Sync["syncContentStatus"]
  DBPiece["content_pieces.status"]
  UserAction --> API --> DBLinks
  API --> Sync --> Derive --> DBPiece
```

> **Worauf achten:** Badge und Dot müssen **dieselbe Logik** widerspiegeln. Abweichungen verwirren Filter („Geplant“ zeigt Piece, Dot ist grau).

### 6.4 Zwei Editoren — Datenverlust vermeiden

Das CMS hat **zwei** Bearbeitungswege für Content — das war eine Hauptquelle für Bugs:

| Editor | Pfad | Schreib-Muster | Risiko |
|--------|------|----------------|--------|
| **ContentEditPanel** | `/content/[id]` | Partielle PATCHes (Lifecycle, einzelne Plattform, Details) | Gering |
| **EpisodeForm** | `/content/[id]/advanced` | Voller PATCH inkl. `platformLinks[]` | **Hoch** — überschreibt alle Links |

**Regeln für EpisodeForm:**

1. `filmingDate` beim Laden aus GET übernehmen und beim Speichern mitsenden — **nie** blind `filmingDate: null`.
2. `postedAt` pro Platform-Link laden und mitsenden — sonst gehen Live-Markierungen verloren.
3. Felder, die der Nutzer nicht geändert hat, nicht aus dem Payload entfernen (Partial-PATCH auf API-Ebene unterstützt `undefined` = „nicht ändern“).

**Regeln für die API (`PATCH /api/content/[id]`):**

1. Link-Replace (DELETE + INSERT) läuft in einer **Transaction** — Insert-Fehler darf nicht alle Links löschen.
2. Platform-PATCH (`/platforms/[slug]`): explizites `null` muss Felder löschen:

```ts
// Richtig:
const scheduledAt = body.scheduledAt !== undefined
  ? parseOptionalDate(body.scheduledAt)
  : existing?.scheduledAt ?? null;

// Falsch (null wird ignoriert):
const scheduledAt = parseOptionalDate(body.scheduledAt) ?? existing?.scheduledAt ?? null;
```

### 6.5 Navigation & Filter

Hub-Filter leben in Query-Params: `type`, `q`, `status`, `sort`, `dir`, `view`, `due`, `page`.

**Filter erhalten beim Navigieren:**

- `buildContentHubUrl()` / `buildContentDetailUrl()` / `buildContentNewUrl()` in `lib/content-hub.ts`
- `returnTo` Query-Param auf Detail-Seiten → „← Hub“ kehrt zum gefilterten Hub zurück
- Episodes-Redirect leitet alle relevanten Params weiter

**Sidebar Active-State** (`components/Sidebar.tsx`):

- `useSearchParams()` — nicht nur `usePathname()`
- „Das Fundament“ aktiv nur bei `/content?type=article`
- „Content“ aktiv bei `/content` ohne Detail-Routen (`/content/[id]`, `/content/new` → Content **nicht** aktiv)
- Sidebar in `<Suspense>` im Layout (Next.js-Anforderung für `useSearchParams`)

**Mobile:**

- Board-Toggle nur ab `md` sichtbar
- Unter `md` wird immer Tabelle gezeigt, auch wenn `view=board` in der URL steht

### 6.6 Datetime-local

HTML `<input type="datetime-local">` erwartet **lokale** Zeit ohne Timezone-Suffix.

```ts
// FALSCH — UTC, verschiebt Stunde:
new Date(iso).toISOString().slice(0, 16)

// RICHTIG:
import { toDatetimeLocalValue, fromDatetimeLocalValue } from "@/lib/datetime-local";
```

Betrifft: ContentEditPanel, PlatformDotRow, EpisodeForm, Server-Pages die datetime-local-Werte vorbereiten, GET `/api/content/[id]`.

### 6.7 Client-State nach `router.refresh()`

Server Components liefern nach Refresh neue Props. Client-Komponenten mit `useState(initial)` **syncen nicht automatisch**.

Lösungen (beide valid):
1. `useEffect(() => setState(prop), [prop, contentId])`
2. `key={contentId}` auf umschließendem Element erzwingt Remount

Betrifft: `LifecycleStepper`, `PlatformDotRow`, `ContentEditPanel`.

### 6.8 Hub-Komponenten

| Komponente | Datei | Rolle |
|------------|-------|-------|
| `ContentHubHeader` | Filter, Suche, View-Toggle, Quick-Create-Link | |
| `ContentBoard` | Kanban nach Lifecycle-Stages | |
| `ContentTable` | Sortierbare Tabelle | |
| `ContentCard` | Board-Karte (max ~7 Elemente) | |
| `ContentQuickCreate` | Slide-over Neuanlage | |
| `ContentEditPanel` | Tabs Status/Details/Inhalt | |
| `LifecycleStepper` | Inline Lifecycle-Wechsel | |
| `PlatformDotRow` | Plattform-Dots + Popover | |

---

## 7. API-Konventionen

### Struktur

```
app/api/
├── auth/login|logout
├── content/              → CRUD + lifecycle + platforms/[slug]
├── cron/refresh-analytics
├── upload                → Vercel Blob
├── vault/entry|reveal
├── prep/                 → Episode Prep
├── guests/
├── mind-dump/
├── media/
└── telegram/inbound
```

### Standard-Pattern für schreibende Content-APIs

```
1. requireSession(req)        → 401 wenn nicht eingeloggt
2. Input validieren           → Zod oder manuelle Checks
3. validatePlatformLinks()    → wenn Links betroffen
4. DB-Operation               → ggf. in Transaction
5. syncContentStatus()        → Publish-Status ableiten
6. invalidateContentCaches()  → Cache-Tags invalidieren
7. NextResponse.json({ … })
```

### Wichtige Endpoints

| Method | Pfad | Zweck |
|--------|------|-------|
| GET/POST | `/api/content` | Liste / Neuanlage |
| GET/PATCH/DELETE | `/api/content/[id]` | Detail / Update / Löschen |
| PATCH | `/api/content/[id]/lifecycle` | Nur Lifecycle-Stage |
| PATCH | `/api/content/[id]/platforms/[slug]` | Einzelne Plattform |
| GET | `/api/cron/refresh-analytics` | Analytics-Pull (Cron) |

### Cron

In `vercel.json`:

```json
{ "path": "/api/cron/refresh-analytics", "schedule": "0 6 * * *" }
```

Täglich 06:00 UTC. Pullt Stats für Links mit `external_id` auf Plattformen `youtube`, `yt_shorts`, `ig_reels`, `instagram`. Insert-only in `analytics_snapshots`.

---

## 8. Design System — Dark Liquid Glass

### Evolution

| Bereich | Look |
|---------|------|
| **Login** | Full Navy (`.login-screen`) — Ausnahme |
| **CMS-Interior** | Dark Liquid Glass (`.cms-shell`) — Navy-Gradient + frosted Panels |
| **Design Preview** | `/design-preview` — Referenz aller Komponenten |

> **Hinweis:** `CLAUDE.md` erwähnt noch „cream-first“ global. Im **CMS-Interior** gilt: Dark Shell mit Glass-Panels. Cream/Gold sind **Akzente auf Dark**, nicht Page-Background.

### Brand Tokens

```css
--navy:       #05101f
--gold:       #c9a84c
--gold-light: #e2c06a
--cream:      #f5eed8
```

### Glass Tokens (CMS)

```css
--glass-bg / --glass-bg-strong     /* Panel-Füllung */
--glass-border / --glass-border-subtle
--text-on-glass / --text-on-glass-muted
--cms-bg-gradient                  /* App-Hintergrund */
```

### Utility-Klassen

| Klasse | Verwendung |
|--------|------------|
| `.cms-shell` | Layout-Wrapper — setzt Dark-Semantic-Overrides |
| `.cms-glass` | Sidebar, leichte Panels |
| `.cms-glass-strong` | Cards, Modals, aktive Nav |
| `.cms-glass-column` | Kanban-Spalten |
| `.cms-glass-hover` | Interaktive Cards |
| `.cms-dot-off / -scheduled / -live` | Platform-Status |
| `.cms-input`, `.cms-label`, `.cms-table` | Formulare — passen sich in `.cms-shell` an |

### Typografie

| Rolle | Font | Nie |
|-------|------|-----|
| Headlines, Buttons, Labels | **Cinzel** | Sans-Serif |
| Subheadlines | **Cormorant Garamond** | Inter, Roboto |
| Body, Inputs, Tabellen | **EB Garamond** | System-UI |

### Shared UI

- `components/ui/Button.tsx` — Glass-Varianten (gold-tinted primary, ghost mit `--text-on-glass-muted`)
- `components/ui/Badge.tsx` — Lesbare Badges auf Dark (Publish-Status)
- `components/CommandPalette.tsx` — Cmd+K, Glass-Modal

### Checkliste: Neue CMS-Seite

- [ ] Liegt unter `app/(cms)/` → automatisch `.cms-shell`
- [ ] Headlines/Zahlen: `--cream` / `--gold-light`, **nicht** `--navy`
- [ ] Plattform-Regeln aus `lib/platforms.ts`, nicht inline
- [ ] DB-Page: `export const dynamic = "force-dynamic"`
- [ ] Client-State sync nach `router.refresh()`
- [ ] Kein Sans-Serif, keine purple AI-Gradienten

---

## 9. Weitere Module

### Dashboard (`/`)

OHE-Prinzip: Offene · Heute · Everything. Widgets: Heute fällig, Pipeline, Diese Woche, Ideen, Plattform-Performance. Nutzt cached Aggregates (`getCachedContentCounts`, `getCachedPlatformViews`).

### Analytics (`/analytics`)

Aggregiert `analytics_snapshots` pro Content Piece. Type-Filter, Sortierung nach Views/Likes/Comments. Scoped auf max 100 Pieces pro Page.

### Episode Prep (`/prep`)

Workspace mit Sections, Share-Token für externe Leseansicht (`/share/prep/[token]`). Verknüpfung mit `content_pieces` nach Aufnahme.

### Mind-Dump (`/mind-dump`)

Ideen & Topics — `forum_threads` + `forum_replies`. Unabhängig vom Content Hub, aber thematisch verbunden.

### Gäste (`/guests`)

CRM für Podcast-Gäste. Verknüpfung via `content_pieces.guest_id`.

### Vault (`/vault`)

Verschlüsselte Passwörter/Accounts. Reveal nur per API mit Session + Audit-Log.

### Media Library (`/media`)

Uploads via Vercel Blob (`POST /api/upload`). Assets verknüpft über `media_asset_links`.

### Shorts Queue (`/shorts/queue`)

Timestamps aus Episoden, die als zukünftige Shorts geplant sind (`clip_queue`).

### Command Palette

Cmd+K (Ctrl+K) — Schnellnavigation zu allen Hauptbereichen. Implementierung in `components/CommandPalette.tsx`.

---

## 10. Deployment & Betrieb

### Pipeline

```
Git Push main → GitHub → Vercel Auto-Deploy → Production
```

Vor jedem Push lokal: **`pnpm build`** muss grün sein.

### Vercel ENV

Alle Variablen aus [Kapitel 2](#2-lokales-setup--umgebungsvariablen) im Vercel-Dashboard setzen. Besonders prüfen:

- `DATABASE_URL` mit Port **6543**
- `SESSION_SECRET` ≠ Dev-Default
- `VAULT_MASTER_KEY` gesichert dokumentiert (Password Manager, nicht nur Vercel)

### Schema-Änderungen

```bash
# 1. Schema in lib/db/schema.ts ändern
pnpm db:generate    # Migration generieren
# 2. In Dev:
pnpm db:push        # Direkt pushen (nur Dev!)
# 3. Indizes bei Bedarf:
pnpm db:push-indexes
```

Production-Migrationen bewusst planen — `db:push` nicht blind auf Production.

### Monitoring

- Vercel Function Logs bei Timeouts (504) — oft zu viele parallele DB-Queries oder fehlende Indizes
- Cron-Logs unter `/api/cron/refresh-analytics`
- Build hängt → fehlendes `force-dynamic` auf DB-Pages prüfen

---

## 11. Anti-Patterns & Checkliste vor Merge

### Niemals tun

| # | Anti-Pattern | Warum |
|---|--------------|-------|
| 1 | Session Pooler Port **5432** | Connection Exhaustion auf Vercel |
| 2 | DB-Page ohne `force-dynamic` | Build hängt / Timeout |
| 3 | Separate Tabelle pro Content-Typ | Architektur-Bruch, doppelte Logik |
| 4 | Plattform-Regeln außerhalb `lib/platforms.ts` | Inkonsistente Matrix, Validierungslücken |
| 5 | `toISOString().slice(0,16)` für datetime-local | Timezone-Verschiebung um 1–2h |
| 6 | EpisodeForm speichert ohne `postedAt` / `filmingDate` | Datenverlust aus Hub |
| 7 | Link-Replace ohne Transaction | Alle Links weg bei Insert-Fehler |
| 8 | Platform-PATCH mit `?? existing` bei null | „Geplant am leeren“ funktioniert nicht |
| 9 | Badge-Logik ≠ Dot-Logik | Widersprüchliche UI |
| 10 | `--navy` Text auf `.cms-shell` | Unlesbar auf Dark Background |
| 11 | `analytics_snapshots` updaten | Trend-Historie zerstört |
| 12 | `revalidate` auf Page-Level | Konflikt mit force-dynamic Pattern |
| 13 | Sans-Serif Fonts | Design System Bruch |

### Checkliste vor Merge

**Build & Lint**
- [ ] `pnpm build` grün
- [ ] `pnpm lint` ohne neue Fehler

**Datenintegrität**
- [ ] Partial PATCH: unveränderte Felder nicht überschreiben
- [ ] Platform-Links: `postedAt` erhalten bei Full-Save
- [ ] Nach Link/Lifecycle-Change: `syncContentStatus` aufgerufen
- [ ] Typ-Wechsel: disallowed Links entfernt

**UI/UX**
- [ ] Glass-Tokens auf Dark Shell, keine Navy-Headlines
- [ ] Sidebar Active-State korrekt für Hub-Filter
- [ ] `returnTo` bei Navigation aus Hub bewahrt
- [ ] Client-Komponenten syncen nach Refresh

**Performance**
- [ ] Analytics scoped auf benötigte IDs
- [ ] Cached Queries statt direkter DB für stabile Daten
- [ ] `maxDuration` auf schweren Pages gesetzt

### Manuelle Smoke-Tests (Content Hub)

1. Quick Create mit URL → Badge **und** Dot zeigen „scheduled“
2. Drehtermin im Panel setzen → Advanced Editor speichern → Datum bleibt
3. Plattform als live markieren → Advanced speichern → `postedAt` bleibt
4. „Geplant am“ leeren → speichern → DB-Feld ist `null`
5. `/content?type=article` → Sidebar „Das Fundament“ aktiv
6. Dashboard-Zahlen lesbar auf Dark Background

---

## 12. Wichtige Dateien (Index)

| Datei | Zweck |
|-------|-------|
| `lib/db/schema.ts` | Drizzle-Schema — Single Source of Truth für Tabellen |
| `lib/db/index.ts` | DB-Client (Transaction Pooler, max:1) |
| `lib/cache.ts` | `unstable_cache` Wrapper |
| `lib/platforms.ts` | Plattform-Matrix pro Content-Typ |
| `lib/lifecycle.ts` | Lifecycle-Stages + DE-Labels |
| `lib/content-status.ts` | Publish-Status ableiten |
| `lib/content-sync.ts` | Status in DB schreiben |
| `lib/content-hub.ts` | Hub-Datenmodell, URLs, Dots, Filter |
| `lib/datetime-local.ts` | Timezone-sichere datetime-local Helpers |
| `lib/crypto.ts` | Vault AES-256-GCM |
| `lib/require-session.ts` | Session verify + API-Guard |
| `proxy.ts` | Auth-Middleware |
| `app/(cms)/layout.tsx` | CMS Shell + Sidebar + Command Palette |
| `app/(cms)/content/page.tsx` | Content Hub Page |
| `components/content/*` | Hub UI-Komponenten |
| `components/EpisodeForm.tsx` | Advanced Editor |
| `components/Sidebar.tsx` | Navigation |
| `app/api/content/[id]/route.ts` | Content CRUD + Transaction Link-Replace |
| `app/api/content/[id]/platforms/[slug]/route.ts` | Einzelne Plattform PATCH |
| `app/globals.css` | Design Tokens + Glass Utilities |
| `vercel.json` | Cron + Function Timeouts |

---

## 13. Weiterführend

- [`CLAUDE.md`](../CLAUDE.md) — Kompakte Agent-Regeln für Cursor/Claude Code
- [`.cursor/skills/eckstein-ui/SKILL.md`](../.cursor/skills/eckstein-ui/SKILL.md) — UI-Skill mit Glass-Regeln
- [`/design-preview`](http://localhost:3000/design-preview) — Live-Komponenten-Referenz (Dev)
- **GitHub:** `ritzaisolutions-dotcom/Eckstein-Podcast-CMS`

---

*Stand: Content Hub Glass Redesign (Phasen 1–6) + Audit-Fixes. Bei Architektur-Änderungen dieses Handbuch mitaktualisieren.*
