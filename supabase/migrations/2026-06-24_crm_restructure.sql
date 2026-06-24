-- CRM Ground-Up Restructure — 2026-06-24
-- Run in Supabase SQL Editor after backup.

BEGIN;

-- ── 2a. Clients bereinigen ───────────────────────────────────────────────────
DELETE FROM public.crm_clients;

ALTER TABLE public.crm_clients DROP COLUMN IF EXISTS scope;
ALTER TABLE public.crm_clients DROP COLUMN IF EXISTS website;
ALTER TABLE public.crm_clients DROP COLUMN IF EXISTS status;

ALTER TABLE public.crm_clients DROP CONSTRAINT IF EXISTS crm_clients_kontakt_medium_check;
ALTER TABLE public.crm_clients
  ADD CONSTRAINT crm_clients_kontakt_medium_check
  CHECK (kontakt_medium IS NULL OR kontakt_medium IN ('email', 'telegram', 'whatsapp'));

-- ── 2b. Network erweitern ────────────────────────────────────────────────────
ALTER TABLE public.crm_network
  ADD COLUMN IF NOT EXISTS niche text,
  ADD COLUMN IF NOT EXISTS tags text[];

-- youtube lives in socials jsonb key "youtube" (no column change)

-- ── 2c. Content: LinkedIn ────────────────────────────────────────────────────
ALTER TABLE public.crm_content
  ADD COLUMN IF NOT EXISTS url_linkedin text;

-- ── 2d. Projekte & To-dos ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.crm_projects (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL,
  category      text,
  status        text DEFAULT 'aktiv',
  kpi_target    jsonb DEFAULT '{}'::jsonb,
  progress_pct  int DEFAULT 0,
  notion_page_id text,
  notiz         text,
  created       timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.crm_todos (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title         text NOT NULL,
  due_date      date,
  done          boolean DEFAULT false,
  project_id    uuid REFERENCES public.crm_projects(id) ON DELETE SET NULL,
  source        text DEFAULT 'crm',
  external_id   text,
  created       timestamptz DEFAULT now()
);

ALTER TABLE public.crm_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_todos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated users full access" ON public.crm_projects;
CREATE POLICY "authenticated users full access"
  ON public.crm_projects FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated users full access" ON public.crm_todos;
CREATE POLICY "authenticated users full access"
  ON public.crm_todos FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Seed projects (idempotent by name)
INSERT INTO public.crm_projects (name, category, kpi_target, progress_pct)
SELECT v.name, v.category, v.kpi_target::jsonb, 0
FROM (VALUES
  ('External Podcast', 'podcast', '{"episodes_quarter":4}'),
  ('Personal Brand', 'personal_brand', '{"posts_month":4}'),
  ('LinkedIn Marketing', 'linkedin', '{"posts_week":3}'),
  ('Cold Calling', 'cold_calling', '{"calls_week":50}')
) AS v(name, category, kpi_target)
WHERE NOT EXISTS (
  SELECT 1 FROM public.crm_projects p WHERE p.name = v.name
);

-- ── 2e. Analytics-Hilfsspalten (crm_contacts) ────────────────────────────────
ALTER TABLE public.crm_contacts
  ADD COLUMN IF NOT EXISTS last_contacted_at timestamptz,
  ADD COLUMN IF NOT EXISTS deal_value_eur numeric,
  ADD COLUMN IF NOT EXISTS consent_basis text;

-- ── 2f. DSGVO consent_basis auf Network ──────────────────────────────────────
ALTER TABLE public.crm_network
  ADD COLUMN IF NOT EXISTS consent_basis text;

COMMIT;
