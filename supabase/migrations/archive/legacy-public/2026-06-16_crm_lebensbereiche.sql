-- Lebensbereiche taxonomy + crm_gewerke category
-- crm_gewerke wird hier mit angelegt, falls 2026-06-15 noch nicht in Supabase lief.

CREATE TABLE IF NOT EXISTS public.crm_lebensbereiche (
  id          serial PRIMARY KEY,
  name        text NOT NULL UNIQUE,
  sort_order  int  NOT NULL DEFAULT 0
);

ALTER TABLE public.crm_lebensbereiche ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_all" ON public.crm_lebensbereiche;
CREATE POLICY "anon_all" ON public.crm_lebensbereiche
  FOR ALL TO anon USING (true) WITH CHECK (true);

INSERT INTO public.crm_lebensbereiche (name, sort_order) VALUES
  ('Handwerk', 10),
  ('Immobilien', 20),
  ('Finanzen & Versicherung', 30),
  ('Tech & Software', 40),
  ('Gesundheit', 50),
  ('Gastronomie', 60),
  ('Einzelhandel', 70),
  ('Dienstleistung', 80),
  ('Sonstiges', 99)
ON CONFLICT (name) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.crm_gewerke (
  name        text        PRIMARY KEY,
  created_at  timestamptz DEFAULT now()
);

ALTER TABLE public.crm_gewerke ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_all" ON public.crm_gewerke;
CREATE POLICY "anon_all" ON public.crm_gewerke
  FOR ALL TO anon USING (true) WITH CHECK (true);

ALTER TABLE public.crm_gewerke
  ADD COLUMN IF NOT EXISTS lebensbereich text;

UPDATE public.crm_gewerke SET lebensbereich = 'Immobilien'
WHERE name ILIKE 'hausverwaltung%' AND lebensbereich IS NULL;

UPDATE public.crm_gewerke SET lebensbereich = 'Handwerk'
WHERE lebensbereich IS NULL;
