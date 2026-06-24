# Datenschutz — RAIS CRM

## Zweck
Das CRM dient der Verwaltung von Geschäftskontakten, Kaltakquise, Kundenbetreuung und internen Projekten für Ritz AI Solutions.

## Verarbeitete Daten
- Kontaktdaten (Firma, Name, Telefon, E-Mail, Website, Notizen)
- Anruf- und Touch-Historie
- Kalender-Termine (über Google Calendar via n8n)
- Optional: Notion-Projektdaten (Phase 2)

## Rechtsgrundlage
- Einwilligung, berechtigtes Interesse oder eigenes Netzwerk (`consent_basis` am Kontakt)
- Keine Weitergabe an Dritte außer technisch notwendige Auftragsverarbeiter: Supabase (Hosting), Google (Kalender), optional Notion

## Speicherdauer
- Kontakte bleiben gespeichert, bis sie im CRM gelöscht werden
- Sessions und Events: für Auswertung, löschbar über Sessions-Seite

## Betroffenenrechte
- Kontakt löschen: über Prospects/Netzwerk/Clients
- Auskunft: Export per CSV (Header-Button „Exportieren“)

## Technische Maßnahmen
- Zugriff nur nach Login (Supabase Auth)
- n8n-Workflows loggen keine Telefonnummern oder E-Mails in Code-Nodes
