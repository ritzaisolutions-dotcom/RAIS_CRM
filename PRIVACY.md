# Datenschutz — RAIS CRM (sales)

## Zweck
Internes CRM für Kaltakquise und Kundenbetreuung von Ritz AI Solutions. Oberfläche: Prospect-Liste, Kunden-Liste, Firmendetail.

## Verarbeitete Daten
- Firmendaten (`sales.companies`): Name, Stadt, Telefon, Website, Qualifikation (Mitarbeiterklasse, CRM-System, Anfragen/Woche, Relationship)
- Personen (`sales.people`): Name, Rolle, E-Mail, Telefon, LinkedIn, Entscheider-Flag
- Touchpoints (`sales.touchpoints`): Kanal, Ergebnis, optional Abbruchgrund, Notiz, nächster Touch — **append-only**
- Opportunities (`sales.opportunities`): Variante, Stage, Preise, Close-Datum

## Rechtsgrundlage
Berechtigtes Interesse an B2B-Akquise und Vertragsanbahnung / -durchführung. Auftragsverarbeiter: Supabase (Hosting, Auth, DB).

## Speicherdauer / Aufbewahrungsfrist (Löschkonzept)

| Daten | Frist / Umgang |
|--------|----------------|
| Prospects & Kundenstammdaten | Solange Geschäftsbeziehung bzw. berechtigtes Interesse; Ausschluss über `relationship = 'Ausgeschlossen'` |
| Touchpoints (Anruf-/Kontaktzähler) | Aufbewahrt für Funnel-/Akquise-Auswertung; bei Art.17 anonymisiert (Zähler bleiben, PII in Notizen entfernt) |
| Opportunities | Bis Abschluss + gesetzliche Aufbewahrung kaufmännischer Unterlagen falls relevant |
| Auth-Sessions | Laut Supabase Auth Session-Laufzeit |

**Normalbetrieb:** Das CRM zeigt vollständige Namen, Telefonnummern, E-Mails und Notizen. Es findet **keine** laufende Anonymisierung statt.

## Betroffenenrechte / Art. 17 (Ausnahmeweg)

Hard-Delete von Firmen ist technisch nicht vorgesehen (`touchpoints.company_id` → `ON DELETE RESTRICT`, append-only Historie).

Bei einem Löschbegehren (Art. 17 DSGVO):

1. Authentifizierter Admin bestätigt die Aktion in der UI (Firmendetail → DSGVO anonymisieren).
2. RPC `sales.gdpr_anonymize(company_id)` überschreibt PII (Firma, Personen, freie Texte, Dokument-Inhalte), setzt `relationship = 'Ausgeschlossen'`, behält anonyme Touchpoint-Zähler.
3. Der Datensatz verschwindet aus der Prospect-Liste; Funnel-Mathematik bleibt gültig.

Das ist **kein** Teil des täglichen Call-Workflows.

## Technische Maßnahmen
- Zugriff nur nach Supabase Auth Login
- RLS: `sales`-Tabellen nur für `authenticated` mit `sales.is_app_user()` — angemeldet **und** in `sales.app_users` freigeschaltet
- Kein Service-Role-Key im Browser
- Keine Kontaktlisten in Git committen (siehe `.gitignore`)
