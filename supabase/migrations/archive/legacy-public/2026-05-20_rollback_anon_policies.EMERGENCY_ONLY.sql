-- ============================================================
-- EMERGENCY ONLY — DO NOT RUN IN NORMAL OPERATIONS
-- ROLLBACK: Restore anon access policies
-- Date:      2026-05-20
-- Use:       Emergency rollback if 2026-05-20_enable_rls.sql breaks things
-- ============================================================
--
-- Run this ONLY if the main migration needs to be reverted.
-- After rollback: anon key has full access again (insecure, but functional).

BEGIN;

-- ── crm_contacts ──────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "authenticated users full access" ON public.crm_contacts;

CREATE POLICY "anon_all"
  ON public.crm_contacts
  FOR ALL
  TO anon
  USING (true)
  WITH CHECK (true);

-- ── crm_clients ───────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "authenticated users full access" ON public.crm_clients;

CREATE POLICY "anon full access"
  ON public.crm_clients
  FOR ALL
  TO anon
  USING (true)
  WITH CHECK (true);

-- ── wf_runs ───────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "authenticated users full access" ON public.wf_runs;

CREATE POLICY "anon read/write"
  ON public.wf_runs
  FOR ALL
  TO anon
  USING (true)
  WITH CHECK (true);

COMMIT;
