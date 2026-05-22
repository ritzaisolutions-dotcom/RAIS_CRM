# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Validate HTML structure and inline script syntax before pushing
npm run validate
```

There is no build step, dev server, or bundler. The app runs as static files served directly. To test locally, open `index.html` via a static file server (e.g. `npx serve .` or VS Code Live Server).

## Architecture

This is a **static, no-build CRM** — a single `index.html` entry point that loads ES modules from `src/`. There is no framework, no bundler, no transpilation. All JS is plain ES2020+ loaded via `<script type="module">`.

### Module layout (`src/`)

| File | Responsibility |
|---|---|
| `state.js` | Single shared mutable object `S`, all constants (`STATUS`, `TSTAT`, `PG`, keys) |
| `supabase.js` | Raw fetch wrappers for Supabase REST API (`sbGet`, `sbUpsert`, `sbDelete`); holds `SB_URL`, `SB_KEY`, and the mutable auth token |
| `auth.js` | Login wall; uses Supabase JS client loaded from CDN; calls `setAuthToken` and triggers `syncCloud` on success |
| `sync.js` | `localStorage` persistence (`persist`, `load`), full cloud sync (`syncCloud`), and incremental dirty-push (`pushDirty`); local-wins merge strategy for dirty contacts |
| `realtime.js` | Supabase Realtime subscription; applies remote INSERT/UPDATE/DELETE to `S.contacts` only when not dirty |
| `prospecting.js` | Main contact list (filtering, sorting, pagination, detail panel, edit/add/delete, touch history, call counter) |
| `leadgen.js` | Lead-Gen tab; n8n webhook calls for WF1–WF3 (discover/qualify/enrich); tab switching logic |
| `email.js` | 3-step email sequence UI and send logic via n8n webhooks WF4–WF6 |
| `clients.js` | Clients tab — CRUD for signed clients stored in `crm_clients` Supabase table |
| `calls.js` | Daily/weekly call counter stored in a separate `localStorage` key |
| `import.js` | CSV import — flexible column-name matching, deduplication by phone/website |
| `touch.js` | Touch (call attempt) history rendering and mutation helpers |
| `ui.js` | Shared rendering primitives: `sbadge`, `roib`, `fdc`, `esc`, `ir`, `toast` |
| `utils.js` | Pure helpers: `gid` (UUID v4), `td` (today ISO string), `relAge`, `gewerkKuerzel`, `gewerkSlug` |

### Data flow

- `S.contacts` is the in-memory source of truth for the Prospecting tab.
- Writes mark a contact dirty (`synced_at = null`). `pushDirty()` auto-syncs after edits; `syncCloud()` does a full bidirectional merge.
- Supabase table: `crm_contacts`. Merge rule: local fields win for `LOCAL_WINS` columns when both sides have changes.
- Clients live in a separate `crm_clients` table; no local cache, always fetched fresh.

### Globals exposed on `window`

`index.html` uses inline `onclick=` handlers. Functions called from HTML must be attached to `window` (e.g. `window.syncCloud`, `window.doLogin`, `window.render`). New event handlers for HTML elements follow this same pattern.

### n8n integration

Lead Gen and email sequences call n8n webhooks at `https://n8n.ritz-ai.solutions/webhook/`. Webhook token is in `leadgen.js` (`WH_TOKEN`). Workflow definitions live in `lead pipeline/` and `email automation/` as `.json` exports.

### Supabase workflows (n8n server-side)

The `supabase workflows/` folder contains n8n workflow JSONs that run server-side enrichment (WF1 Discover → WF2 Qualify → WF3 Enrich → WF4/5/6 Email sequences).

## Key conventions

- **All UI text is German.** Labels, toasts, button text, error messages — always German.
- **Status keys are English slugs** (`neu`, `interessiert`, `demo_termin`, etc.) defined in `state.js:STATUS`. Display labels are German.
- **No type checking, no linting config.** Use `npm run validate` to catch HTML/script breakage before committing.
- **`render()` is a global** defined in `index.html`'s inline script that re-renders the contact table. Call it after mutating `S.contacts`.
- The `touches` array on each contact records call attempts: `[{ status, datum, notiz }]`. The first element maps to legacy `t1_*` fields on import.
