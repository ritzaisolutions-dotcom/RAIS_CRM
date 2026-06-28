# Datenschutz — RAIS CRM

## Zweck
Das CRM dient der Verwaltung von Geschäftskontakten, Kaltakquise und Kundenbetreuung für Ritz AI Solutions.

## Verarbeitete Daten
- Kontaktdaten (Firma, Name, Telefon, E-Mail, Website, Notizen)
- Anruf- und Touch-Historie
- Kalender-Termine (über Google Calendar via n8n)
- Persönliches Netzwerk (`crm_network`)

## Rechtsgrundlage
- Einwilligung, berechtigtes Interesse oder eigenes Netzwerk (`consent_basis` am Kontakt)
- Auftragsverarbeiter: Supabase (Hosting), Google (Kalender), n8n (Automation)

## Lokale Speicherung
- Kontakte werden in `localStorage` gecacht (`rais_crm_v3`) für Offline-Nutzung
- Bei Logout und Session-Ablauf werden lokale CRM-Daten gelöscht (`clearLocalCrmData`)

## Speicherdauer
- Kontakte bleiben gespeichert, bis sie im CRM gelöscht werden
- Sessions und Events: für Auswertung, löschbar über Sessions-Seite

## Betroffenenrechte
- Kontakt löschen: über Prospects/Netzwerk/Clients
- Auskunft: Export per CSV (Header-Button „Exportieren“)

## Technische Maßnahmen
- Zugriff nur nach Login (Supabase Auth)
- Row Level Security: CRM-Tabellen nur für `authenticated`
- n8n-Workflows loggen keine Telefonnummern oder E-Mails in Code-Nodes
- Keine Kontaktlisten in Git committen (siehe `.gitignore`)
