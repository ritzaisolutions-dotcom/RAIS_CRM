-- Historical backfill: this migration was already applied remotely (version 20260703141344).
-- Kept in git so local migrations mirror production history.
BEGIN;

CREATE TABLE IF NOT EXISTS public.linkedin_outreach (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  firma text,
  telefon text,
  linkedin_name text,
  linkedin_url text,
  stadt text,
  region text,
  gewerk text DEFAULT 'Immobilienmakler'::text,
  touch_stufe integer DEFAULT 0 CHECK (touch_stufe >= 0 AND touch_stufe <= 5),
  status text DEFAULT 'erstkontakt'::text,
  notiz text,
  next_touch_date date,
  crm_contact_id text REFERENCES public.crm_contacts (id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.linkedin_outreach ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_full_access" ON public.linkedin_outreach;
CREATE POLICY "authenticated_full_access"
  ON public.linkedin_outreach
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

COMMIT;
