# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Validate HTML structure and inline script syntax before pushing
npm run validate
```

There is no build step, dev server, or bundler. The app runs as static files served directly. To test locally, open `index.html` via a static file server (e.g. `npx serve .` or VS Code Live Server).

## Architecture

This is a **static, no-build CRM** — a single `index.html` entry point that loads ES modules from `src/`. There is no framework, no bundler, no transpilation. All JS is plain ES2020+ loaded via `<script type="module">`. It is also a PWA (`manifest.json`, service worker) installable on desktop and mobile.

### Module layout (`src/`)

| File | Responsibility |
|---|---|
| `state.js` | Single shared mutable object `S`, all constants (`STATUS`, `TSTAT`, `PG`, keys) |
| `supabase.js` | Raw fetch wrappers for Supabase REST API (`sbGet`, `sbUpsert`, `sbDelete`); holds `SB_URL`, `SB_KEY`, and the mutable auth token |
| `auth.js` | Login wall; uses Supabase JS client loaded from CDN; calls `setAuthToken` and triggers `syncCloud` on success |
| `sync.js` | `localStorage` persistence (`persist`, `load`), full cloud sync (`syncCloud`), and incremental dirty-push (`pushDirty`); local-wins merge strategy for dirty contacts |
| `realtime.js` | Supabase Realtime subscription; applies remote INSERT/UPDATE/DELETE to `S.contacts` only when not dirty |
| `sidebar.js` | Navigation: `initSidebar()`, `navigateTo(pageId)`, collapse/expand, mobile bottom nav; fires `rais:page-change` custom event on navigation |
| `sessions.js` | Cold call session tracker — start/pause/resume/end/discard; header widget timer; sessions history page with breakdown bars and event log; persists active session in `localStorage` under `SESSION_KEY` |
| `prospecting.js` | Main contact list (filtering, sorting, pagination, detail panel, edit/add/delete, touch history, call counter) |
| `leadgen.js` | Lead-Gen tab; n8n webhook calls for WF1–WF3 (discover/qualify/enrich); listens on `rais:page-change` for lazy init |
| `email.js` | Compose modal + send via n8n WF7 (`wf7-compose`); legacy WF4–WF6 removed from UI |
| `calendar.js` | Demo/Rückruf Google Calendar via WF8 (`wf8-calendar`, ritzaisolutions@gmail.com) |
| `termine.js` | Termine tab — Google Calendar embed + CRM agenda; lazy init on `rais:page-change` |
| `contextmenu.js` | Right-click menu on contact rows/cards (mark, email, sales rep, delete) |
| `salesrep.js` | Sales Rep Assistant — modal + tab, WF9 (`wf9-salesrep`), history in `rais_salesrep_history` |
| `clients.js` | Clients tab — CRUD for signed clients stored in `crm_clients`; listens on `rais:page-change` for lazy init |
| `calls.js` | Daily/weekly call counter stored in a separate `localStorage` key |
| `import.js` | CSV import — flexible column-name matching, deduplication by phone/website |
| `touch.js` | Touch (call attempt) history rendering and mutation helpers |
| `ui.js` | Shared rendering primitives: `sbadge`, `roib`, `fdc`, `esc`, `ir`, `toast` |
| `utils.js` | Pure helpers: `gid` (UUID v4), `td` (today ISO string), `relAge`, `gewerkKuerzel`, `gewerkSlug` |

### Data flow

- `S.contacts` is the in-memory source of truth for the Prospecting tab.
- Writes mark a contact dirty (`synced_at = null`). `pushDirty()` auto-syncs after edits; `syncCloud()` does a full bidirectional merge.
- Merge rule: `LOCAL_WINS` fields (`status`, `followup`, `roi`, `notiz`, `kontakt`, `title`, `telefon`, `email`, `touches`, `status_changed_at`, `firma`, `website`, `gewerk`, `stadt`, `region`) always use the local value when a contact is dirty.
- Clients live in a separate `crm_clients` table; no local cache, always fetched fresh.

### Supabase tables

| Table | Used by |
|---|---|
| `crm_contacts` | `sync.js`, `realtime.js`, `prospecting.js` |
| `crm_clients` | `clients.js` |
| `crm_sessions` | `sessions.js` — one row per session, `is_active` flag, duration/breakdown on close |
| `crm_session_events` | `sessions.js` — one row per status change while a session is running |

### Page initialization pattern

Pages are lazy-initialized on first navigation via the `rais:page-change` custom event fired by `sidebar.js`. The exception is `sessions`, which is initialized directly in `index.html`:

```js
window.addEventListener('rais:page-change', function(e) {
  if (e.detail.page === 'sessions') initSessionsPage(containerEl);
});
```

`leadgen.js`, `clients.js`, and `termine.js` register their own `rais:page-change` listeners internally. `salesrep.js` also listens for the tab; `index.html` may call `initSalesRepPage()` on navigation (idempotent).

### Globals exposed on `window`

`index.html` uses inline `onclick=` handlers. Functions called from HTML must be attached to `window` (e.g. `window.syncCloud`, `window.doLogin`, `window.render`). New event handlers for HTML elements follow this same pattern.

### n8n integration

Lead Gen and email sequences call n8n webhooks at `https://n8n.ritz-ai.solutions/webhook/`. Webhook token is in `leadgen.js` (`WH_TOKEN`). Workflow definitions live in `lead pipeline/`, `email automation/`, `n8n-workflows/`, and `supabase workflows/` as `.json` exports.

## Key conventions

- **All UI text is German.** Labels, toasts, button text, error messages — always German.
- **Status keys are English slugs** (`neu`, `interessiert`, `demo_termin`, etc.) defined in `state.js:STATUS`. Display labels are German.
- **No type checking, no linting config.** Use `npm run validate` to catch HTML/script breakage before committing.
- **`render()` is a global** defined in `index.html`'s inline script that re-renders the contact table. Call it after mutating `S.contacts`.
- The `touches` array on each contact records call attempts: `[{ status, datum, notiz }]`. The first element maps to legacy `t1_*` fields on import.
- `sessions.js:onStatusChanged()` must be called whenever a contact's status changes during an active session so the breakdown and event log stay accurate.
