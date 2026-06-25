-- Tageslog für manuelle Outreach-Aktivität (Dashboard Analytics Phase 2)
BEGIN;

CREATE TABLE IF NOT EXISTS public.crm_activity_daily (
  activity_date date PRIMARY KEY,
  linkedin_dm_manual int NOT NULL DEFAULT 0,
  meta_ads_inbound_manual int NOT NULL DEFAULT 0,
  notiz text,
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.crm_activity_daily ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated users full access" ON public.crm_activity_daily;
CREATE POLICY "authenticated users full access"
  ON public.crm_activity_daily
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

COMMIT;
