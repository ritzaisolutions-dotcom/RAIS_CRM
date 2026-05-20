# Technical Reliability Audit — Interne Software

---

## 0. Wann dieser Audit läuft

Vor jedem Major-Deployment, nach jeder Infra-Änderung (Auth, DB, CI/CD), und immer wenn
ein System nach Umbau "irgendwie funktioniert aber man weiß nicht genau warum".

---

## 1. Deployment-Integrität

**Was prüfen:**

Ist das, was auf dem Server läuft, tatsächlich der aktuelle Code?

```
1. git log --oneline -5              → neueste Commits lokal
2. Deployment-Platform → Deployments → letzter Build
3. Commit-SHA vergleichen: lokal == live?
4. Build-Logs auf Fehler prüfen
```

**Was schiefgehen kann:**

- Vercel deployed erfolgreich, aber `vercel.json` leitet alle Pfade auf `index.html` um
  → JS-Module werden als HTML ausgeliefert → MIME-Type-Fehler → nichts funktioniert,
  keine sichtbare Fehlermeldung
- Build deployed nur `index.html`, nicht `src/` → gleiches Symptom

**Diagnose-Tool:** Browser → F12 → Console → nach `Failed to load module script` / `MIME type` suchen

**Regel:** Jede `vercel.json` / `nginx.conf` / `_redirects` bei Modularisierung re-prüfen.
Was für eine Single-File-App korrekt war, bricht nach Modularisierung.

---

## 2. Datenbankzugriff & Sicherheit (RLS / Policies)

**Was prüfen:**

```sql
SELECT tablename, policyname, roles, cmd
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename;
```

**Rote Flags:**
- `anon` role mit `FOR ALL` → jeder im Internet kann lesen/schreiben/löschen
- Keine Policy vorhanden → RLS ist aktiviert aber niemand kommt rein (oder aus)
- `service_role` im Frontend-Code → sofortiger Security-Incident

**Regel für jede Tabelle:**

| Zugriff | Wer | Wie |
|---------|-----|-----|
| Öffentliches Formular (z.B. Lead-Submit) | `anon INSERT` | nur Insert, kein Select/Delete |
| Interne App | `authenticated` ALL | nach JWT-Login |
| Backend-Automation (n8n, Cron) | Service Role Key | nur serverseitig, nie im Frontend |

---

## 3. Authentifizierung — End-to-End Prüfung

**Die 5 kritischen Fragen:**

**1. Ist Auth wirklich erzwungen?** → Mit anon-Key direkt auf die API zugreifen:
```
curl https://[project].supabase.co/rest/v1/crm_contacts \
  -H "apikey: <anon-key>"
```
Erwartung: leer oder 403. Wenn Daten kommen → RLS fehlt.

**2. Wo wird der Token gesetzt?** → Vor dem ersten API-Call oder danach?

Richtig: `await window._authReady` blockiert Startup bis JWT gesetzt ist.
Falsch: API-Calls laufen mit anon-Key, JWT wird erst später gesetzt.

**3. Was passiert bei Token-Ablauf?** → `onAuthStateChange` Handler vorhanden?
Wird der neue Token automatisch übernommen?

**4. Wird der Fehler dem User angezeigt?** → Stilles `return` bei fehlendem Auth-Client
ist ein Anti-Pattern. Immer konkretes Feedback in der UI.

**5. Passwort-Hashing kompatibel?** → SQL-basiertes Password-Reset mit `crypt()` muss
`gen_salt('bf', 10)` verwenden — nicht den Default (Cost 6). Supabase erwartet Cost 10.

---

## 4. Datenpersistenz & Sync-Logik

**Das zentrale Problem:** Welches System ist Source of Truth?

Explizit dokumentieren und im Code durchsetzen:

```
Remote (Supabase)    → Source of Truth für: Welche Datensätze existieren
Local (localStorage) → Source of Truth für: User-Edits (ROI, Notiz, Status)
```

**Was prüfen:**

- `LOCAL_WINS` Felder vollständig? Fehlt ein Feld → User-Edit wird beim nächsten Sync
  überschrieben
- Dirty-Flag korrekt? Wird `markDirty()` bei jeder User-Aktion aufgerufen?
- Sync-Lock vorhanden? Parallele Syncs führen zu Race Conditions
- Nach Login: Wird ein frischer Sync getriggert? (Mit JWT, nicht mit anon-Key)

**LocalStorage-Migrations-Risiko:**

Wenn der Storage-Key sich ändert oder die App auf eine neue URL/Origin umzieht
(z.B. `file://` → `https://`), ist der alte LocalStorage unsichtbar. Checklist:
- Selber Origin vor und nach dem Deployment?
- Storage-Key dokumentiert und versioniert?
- Migration-Script vorbereitet wenn Origin-Wechsel geplant?

**Recovery-Script (LocalStorage → Supabase):**

Wenn Daten lokal existieren aber nie zu Supabase gepusht wurden:
```js
// In der Browser-Console der alten App ausführen:
JSON.stringify(
  JSON.parse(localStorage.getItem('storage_key') || '[]')
    .filter(c => /* geänderte Felder */ c.roi > 1)
    .map(c => ({id: c.id, name: c.name, field: c.field})),
  null, 2
)
// Output → SQL UPDATE generieren → in Supabase SQL Editor ausführen
```

---

## 5. Externe Integrationen (n8n, Webhooks, APIs)

**Für jede Integration dokumentieren (SCHEMA_MAP):**

```
WF1 → schreibt: firma, telefon, website, status, reviews, stadt, gewerk
WF2 → schreibt: website, telefon, extra.lead_score, extra.qualified
...
```
Ohne SCHEMA_MAP bricht jede Spalten-Umbenennung still.

**Webhook-Sicherheit prüfen:**
- Auth vorhanden? (Header-Token, HMAC, OAuth)
- Ohne Auth: öffentlich aufrufbarer Trigger → Angreifer kann beliebig Daten schreiben

**Service Role Key Audit:**
```
grep -r "service_role" src/ public/ *.html
```
Null Treffer erwartet. Einer → sofort rotieren.

---

## 6. Infrastruktur-Konfiguration

**Dateien die bei jedem Umbau re-geprüft werden müssen:**

| Datei | Risiko bei Umbau |
|-------|-----------------|
| `vercel.json` | SPA-Routes blockieren Modul-Pfade |
| `_redirects` (Netlify) | Gleiches Problem |
| `nginx.conf` | `try_files` Reihenfolge falsch |
| `.env` / `.env.local` | Keys im Repo committed? |
| `manifest.json` | Falsche Syntax → PWA-Install schlägt still fehl |
| CORS-Settings in Supabase | Neue Domain nach Deployment nicht eingetragen |

---

## 7. Browser-Diagnose-Protokoll

Wenn "funktioniert nicht" ohne weitere Info — in dieser Reihenfolge:

```
1. F12 → Console → alle roten Fehler lesen
2. F12 → Network → fehlgeschlagene Requests (rot) → Response-Body ansehen
3. F12 → Application → LocalStorage → Daten vorhanden?
4. F12 → Application → Service Workers → alten SW deregistrieren
5. Ctrl+Shift+R (Hard Refresh) → Cache-Problem ausschließen
6. Inkognito-Fenster → Extension-Problem ausschließen
7. Anderen Browser → Browser-spezifisches Problem ausschließen
```

**Häufige stille Fehler:**

| Symptom | Ursache | Diagnose |
|---------|---------|----------|
| Button-Klick ohne Reaktion | Funktion nicht auf `window` | Console: `ReferenceError` |
| Leere Tabelle nach Login | Sync lief vor JWT-Setzung | Network: API-Call mit anon-Key |
| Alle API-Calls schlagen fehl | MIME-Type-Fehler beim Modul-Load | Console: `Failed to load module script` |
| Login scheinbar erfolgreich aber Daten leer | `syncCloud` nicht nach Login aufgerufen | Network: kein Supabase-Request nach Login |

---

## 8. Schema-Änderungen — Checkliste

Vor jeder Spalten-Änderung:

```
1. SCHEMA_MAP prüfen → schreibt ein Workflow in diese Spalte?
2. Wenn ja → erst Workflow in n8n updaten + exportieren
3. Migration als SQL-Datei anlegen (YYYY-MM-DD_beschreibung.sql)
4. Backup ziehen (oder CSV-Export der betroffenen Tabellen)
5. Migration idempotent schreiben (IF NOT EXISTS / IF EXISTS)
6. Migration anwenden
7. SCHEMA_MAP updaten
8. Committen: migration SQL + SCHEMA_MAP zusammen in einem Commit
```

**Niemals:**
- Spalte umbenennen ohne Schritt 1–2
- `DROP TABLE` ohne Backup
- Direkt in Production-DB editieren ohne Migration-Datei
- Migration nicht in Versionskontrolle

---

## 9. Audit-Reihenfolge für neue interne Tools

### Phase 1 — Sicherheit (bevor Tool produktiv geht)

```
□ Alle DB-Tabellen: anon-Zugriff geprüft und dokumentiert?
□ Secrets im Code? (grep -r "secret\|password\|service_role" src/)
□ Auth end-to-end getestet: Login, Token-Refresh, Logout, falsches Passwort?
□ Webhook-Endpoints gesichert (Header-Token oder HMAC)?
□ Service Role Key ausschließlich serverseitig?
```

### Phase 2 — Datenintegrität

```
□ Source of Truth pro Feld dokumentiert?
□ Sync-Konflikt-Strategie definiert und im Code umgesetzt?
□ Dirty-Flag / Optimistic-Locking vorhanden?
□ Alle externen Schreiber in SCHEMA_MAP?
□ Sync-Lock gegen parallele Syncs?
□ Nach Login frischer Sync mit neuem JWT?
```

### Phase 3 — Infrastruktur

```
□ Deployment-Config (vercel.json etc.) für aktuelle Architektur korrekt?
□ Alle Datei-Typen korrekt served (MIME types)?
□ Origin-Konsistenz (kein file:// → https:// Wechsel ohne Datenmigration)?
□ CI/CD: wird das richtige gebaut und deployed?
□ Commit-SHA lokal == live?
```

### Phase 4 — Resilience

```
□ Fehlermeldungen sichtbar für User (keine stillen returns)?
□ Was passiert bei Offline / API-Fehler?
□ Recovery-Pfad für verlorene LocalStorage-Daten dokumentiert?
□ Rollback-Migration vorhanden?
□ Kann der Auth-User sein Passwort ohne Entwickler-Hilfe zurücksetzen?
```

---

## 10. Dokumentations-Minimum

Jedes interne Tool braucht diese 4 Dateien:

| Dokument | Inhalt |
|----------|--------|
| `SCHEMA_MAP.md` | Welches System schreibt welche Spalte — Pflichtlektüre vor Schema-Änderungen |
| `migrations/README.md` | Wie Migrations angelegt, angewandt und zurückgerollt werden |
| `IMPLEMENTATION_LOG.md` | Was wann geändert wurde und warum, offene manuelle Schritte |
| `integrations/README.md` | Alle externen Systeme: Auth, Webhooks, Credentials, wo sie konfiguriert sind |

Ohne diese Dokumente ist jeder Umbau ein Blindflug.

---

## 11. Wiederkehrende Checks (monatlich)

```
□ Supabase → Advisors → Security-Warnungen?
□ Supabase → Auth → Users → inaktive User entfernen?
□ n8n → alle Workflows aktiv und ohne Fehler-History?
□ Vercel → Deployment-Log der letzten 30 Tage → stille Build-Fehler?
□ API-Keys rotieren die älter als 90 Tage sind?
□ Supabase-Plan: Quotas (DB-Größe, Auth-MAUs, Realtime-Connections) im grünen Bereich?
```
