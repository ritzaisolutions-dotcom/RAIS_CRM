-- ============================================================
-- Migration: Content-Tracker Tabelle für CRM Content-Seite
-- Date:      2026-06-05
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.crm_content (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title         text NOT NULL,
  type          text NOT NULL CHECK (type IN ('lfc', 'sfc', 'article')),
  status        text NOT NULL DEFAULT 'idee'
                  CHECK (status IN ('idee', 'skript', 'dreh', 'schnitt', 'live')),
  platforms     text NOT NULL DEFAULT 'youtube',
  publish_date  date,
  url_youtube   text,
  url_instagram text,
  url_x         text,
  notiz         text,
  created_at    timestamptz DEFAULT now()
);

ALTER TABLE public.crm_content ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated users full access" ON public.crm_content;
CREATE POLICY "authenticated users full access"
  ON public.crm_content
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

COMMIT;
