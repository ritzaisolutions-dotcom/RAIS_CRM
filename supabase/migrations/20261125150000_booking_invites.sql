-- Terminvorschläge aus dem CRM: pro E-Mail eine Einladung mit 1–5 Slots.
-- Der Lead bucht über /termin/<token> (öffentliche Seite im CRM), die
-- Edge Function `booking-invite` prüft Verfügbarkeit, legt die Buchung an,
-- setzt den Lead auf „Termin gebucht“ und protokolliert einen Touch.

CREATE TABLE IF NOT EXISTS sales.booking_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token text NOT NULL UNIQUE
    DEFAULT replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
  company_id uuid NOT NULL REFERENCES sales.companies (id) ON DELETE CASCADE,
  person_id uuid REFERENCES sales.people (id) ON DELETE SET NULL,
  event_slug text NOT NULL DEFAULT 'erstgespraech',
  slots jsonb NOT NULL,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  booked_at timestamptz,
  booked_starts_at timestamptz,
  booking_id uuid,
  CONSTRAINT booking_invites_slots_array CHECK (
    jsonb_typeof(slots) = 'array'
    AND jsonb_array_length(slots) BETWEEN 1 AND 5
  )
);

CREATE INDEX IF NOT EXISTS booking_invites_company_idx
  ON sales.booking_invites (company_id, created_at DESC);

ALTER TABLE sales.booking_invites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS booking_invites_select ON sales.booking_invites;
CREATE POLICY booking_invites_select ON sales.booking_invites
  FOR SELECT TO authenticated
  USING ((SELECT sales.is_app_user()));

DROP POLICY IF EXISTS booking_invites_insert ON sales.booking_invites;
CREATE POLICY booking_invites_insert ON sales.booking_invites
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT sales.is_app_user()));

REVOKE ALL ON sales.booking_invites FROM anon, authenticated;
GRANT SELECT, INSERT ON sales.booking_invites TO authenticated;
GRANT ALL ON sales.booking_invites TO service_role;

-- Vorlage mit Platzhalter für die Terminvorschläge.
INSERT INTO sales.email_templates (name, subject, body)
SELECT
  'Terminvorschläge Erstgespräch',
  'Kurzes Gespräch – passt einer dieser Termine?',
  $t$Hallo {{vorname|zusammen}},

wie besprochen schlage ich ein kurzes Erstgespräch (45 Minuten, telefonisch oder per Video) vor. Diese Termine habe ich für Sie freigehalten:

{{terminvorschlaege}}

Ein Klick auf den passenden Termin genügt, Sie bekommen danach direkt eine Bestätigung. Passt keiner, antworten Sie einfach kurz mit einem Wunschtermin.

Viele Grüße
{{absender}}$t$
WHERE NOT EXISTS (
  SELECT 1 FROM sales.email_templates WHERE lower(name) = lower('Terminvorschläge Erstgespräch')
);
