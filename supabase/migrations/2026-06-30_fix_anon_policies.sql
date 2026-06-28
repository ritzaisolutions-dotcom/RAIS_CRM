-- Close anon RLS holes on network and taxonomy tables
BEGIN;

DROP POLICY IF EXISTS "anon_all" ON public.crm_network;
CREATE POLICY "authenticated users full access"
  ON public.crm_network FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_all" ON public.crm_gewerke;
CREATE POLICY "authenticated users full access"
  ON public.crm_gewerke FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_all" ON public.crm_lebensbereiche;
CREATE POLICY "authenticated users full access"
  ON public.crm_lebensbereiche FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

COMMIT;
