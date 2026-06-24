-- Personal network contacts (separate from sales prospects)

CREATE TABLE IF NOT EXISTS public.crm_network (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created       timestamptz DEFAULT now(),
  name          text NOT NULL,
  firma         text,
  rolle         text,
  lebensbereich text,
  gewerk        text,
  telefon       text,
  email         text,
  socials       jsonb DEFAULT '{}'::jsonb,
  met_at        date,
  met_where     text,
  stadt         text,
  plz           text,
  strasse       text,
  notiz         text,
  synced_at     timestamptz
);

ALTER TABLE public.crm_network ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon_all" ON public.crm_network
  FOR ALL TO anon USING (true) WITH CHECK (true);
