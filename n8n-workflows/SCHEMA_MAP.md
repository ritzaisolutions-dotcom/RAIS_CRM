# n8n → Supabase Schema Map

Welche Spalten jeder Workflow schreibt. **Vor jeder Schema-Änderung prüfen.**

Stand: 2026-05-20

## crm_contacts — Spalten nach Quelle

| Spalte | Typ | Geschrieben von | Gelesen vom Frontend |
|--------|-----|-----------------|---------------------|
| `id` | text | Frontend (nanoid) | ✓ |
| `created` | bigint | Frontend (Date.now()) | ✓ |
| `firma` | text | WF1, Frontend | ✓ |
| `kontakt` | text | WF3, Frontend | ✓ |
| `title` | text | Frontend | ✓ |
| `telefon` | text | WF1, WF2, Frontend | ✓ |
| `email` | text | WF3, Frontend | ✓ |
| `website` | text | WF1, WF2, Frontend | ✓ |
| `status` | text | WF1, WF2, Frontend | ✓ |
| `followup` | text | Frontend | ✓ |
| `roi` | integer | Frontend | ✓ |
| `reviews` | text | WF1, WF2 | ✓ |
| `stadt` | text | WF1, Frontend | ✓ |
| `region` | text | Frontend | ✓ |
| `gewerk` | text | WF1, Frontend | ✓ |
| `besonderheit` | text | WF3, Frontend | ✓ |
| `notiz` | text | Frontend | ✓ |
| `touches` | jsonb | Frontend | ✓ |
| `extra` | jsonb | WF2, WF3 (overflow) | ✓ (via extra.*) |
| `synced_at` | timestamptz | Frontend | — |
| `status_changed_at` | text | Frontend | ✓ |
| `email_1_sent` | date | WF4, Frontend | ✓ |
| `email_1_subject` | text | WF4, Frontend | ✓ |
| `email_2_sent` | date | WF5, Frontend | ✓ |
| `followup_sent` | date | WF6, Frontend | ✓ |
| `email_status` | text | WF4, WF5, WF6, Frontend | ✓ |
| `unsubscribed` | boolean | Frontend | ✓ |
| `reply_received` | boolean | Frontend | ✓ |

### Felder im `extra` JSON (geschrieben von WF2/WF3)

Diese Felder landen in `extra.{name}` und werden beim Sync vom Frontend auf Top-Level gespiegelt:

| extra-Feld | Typ | Workflow |
|------------|-----|---------|
| `extra.hauptleistung` | text | WF3 |
| `extra.webseite_alter` | text | WF2 |
| `extra.webseite_vorhanden` | text | WF2 (`'TRUE'` / `'FALSE'`) |
| `extra.hat_kalkulator` | text | WF2 (`'TRUE'` / `'FALSE'`) |
| `extra.facebook` | text | WF3 |

## Workflow-Übersicht

### WF1 — Discover (`wf1-discover`)
Findet neue Leads via Google Places API.

**Schreibt in `crm_contacts`:**
`place_id` (via extra), `firma`, `adresse` (via extra), `telefon`, `website`, `rating` (via extra), `reviews`, `stadt`, `gewerk`, `status`

**Schreibt in `wf_runs`:**
`wf='wf1'`, `stadt`, `status`, `count`, `finished_at`

---

### WF2 — Qualify (`wf2-qualify`)
Bewertet Website-Qualität, berechnet Lead Score.

**Schreibt in `crm_contacts`:**
`website`, `telefon`, `rating` (via extra), `reviews`, `extra.webseite_vorhanden`, `extra.webseite_alter`, `extra.hat_kalkulator`, `extra.lead_score`, `extra.score_reasons`, `extra.qualified`, `status`

**Schreibt in `wf_runs`:**
`wf='wf2'`, `status`, `count`, `finished_at`

---

### WF3 — Enrich (`wf3-enrich`)
Findet Ansprechpartner, Email, Social Media.

**Schreibt in `crm_contacts`:**
`besonderheit`, `kontakt`, `email`, `extra.instagram`, `extra.facebook`, `extra.hauptleistung`, `extra.enriched`

**Schreibt in `wf_runs`:**
`wf='wf3'`, `status`, `count`, `finished_at`

---

### WF4 — Email 1 (`wf4-email1`) — *deprecated (CRM-UI entfernt)*
Legacy-Sequenz. Nicht mehr aus dem CRM aufgerufen.

---

### WF5 / WF6 — *deprecated (CRM-UI entfernt)*

---

### WF7 — CRM Compose (`wf7-compose`)
Einzelmail aus CRM (Rechtsklick). `preview_only` → `{ subject, body }`; `approved` → SMTP-Versand.

**CRM schreibt lokal (kein Pflicht-Feld in Supabase):**
`extra.email_log[]`, neuer `touches`-Eintrag (Status „Email“)

**SMTP-Absender:** `kevin@ritz-ai.solutions` (Hostinger, Credentials in n8n)

---

### WF8 — CRM Calendar (`wf8-calendar`)
Interner Google-Kalender **ritzaisolutions@gmail.com** (keine Kunden-Einladungen).

**Request:** `type` (`demo`|`rueckruf`), `start` (ISO mit Offset), `duration_minutes` (15|5), Kontaktfelder.

**Response:** `{ ok, event_id, htmlLink }`

**CRM schreibt lokal (optional):** `extra.google_cal` (Audit)

**Nicht:** `kevin@ritz-ai.solutions` — nur WF7 für Kundenmail.

---

## Wichtige Regel

> **Vor jeder Spalten-Umbenennung oder -Löschung:**
> 1. Prüfe ob die Spalte in dieser Tabelle vorkommt.
> 2. Wenn ja: erst den betroffenen Workflow in n8n updaten.
> 3. Workflow-JSON exportieren und als neuen Commit einchecken.
> 4. Dann die DB-Migration anwenden.
> 5. `SCHEMA_MAP.md` updaten.
