-- crm_gewerke: user-defined custom Gewerk entries
-- Applied: 2026-06-15
-- Run once in Supabase SQL editor.

CREATE TABLE IF NOT EXISTS public.crm_gewerke (
  name        text        PRIMARY KEY,
  created_at  timestamptz DEFAULT now()
);

ALTER TABLE public.crm_gewerke ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon_all" ON public.crm_gewerke
  FOR ALL TO anon USING (true) WITH CHECK (true);
