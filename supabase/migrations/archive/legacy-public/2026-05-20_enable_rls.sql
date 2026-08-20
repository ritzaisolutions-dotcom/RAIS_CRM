-- ============================================================
-- Migration: Secure CRM tables — authenticated-only RLS
-- Date:      2026-05-20
-- Author:    Claude Code / RAIS Implementation Plan Phase 1.3
-- ============================================================
--
-- CURRENT STATE (before this migration):
--   crm_contacts  → policy "anon_all"        anon has ALL access  ← SECURITY HOLE
--   crm_clients   → policy "anon full access" anon has ALL access  ← SECURITY HOLE
--   wf_runs       → policy "anon read/write"  anon has ALL access  ← SECURITY HOLE
--
-- AFTER THIS MIGRATION:
--   All three tables → authenticated users only (full access)
--   Anon key (public in frontend code) can no longer read/write/delete
--
-- ⚠️  PREREQUISITES — DO NOT APPLY BEFORE THESE ARE DONE:
--   1. Supabase Dashboard → Authentication → Providers → Email enabled
--   2. User kevin@ritz-ai.solutions created in Supabase Auth dashboard
--   3. n8n workflows WF1-WF6 updated to use Service Role Key (bypasses RLS)
--   4. Frontend updated to use Supabase Auth JWT (Phase 1.2 frontend done)
--
-- ROLLBACK: supabase/migrations/2026-05-20_rollback_anon_policies.sql
-- ============================================================

BEGIN;

-- ── crm_contacts ──────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "anon_all" ON public.crm_contacts;

CREATE POLICY "authenticated users full access"
  ON public.crm_contacts
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- ── crm_clients ───────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "anon full access" ON public.crm_clients;

CREATE POLICY "authenticated users full access"
  ON public.crm_clients
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- ── wf_runs ───────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "anon read/write" ON public.wf_runs;

CREATE POLICY "authenticated users full access"
  ON public.wf_runs
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

COMMIT;

-- Verification query (run after applying):
-- SELECT tablename, policyname, roles, cmd
-- FROM pg_policies
-- WHERE schemaname = 'public'
--   AND tablename IN ('crm_contacts', 'crm_clients', 'wf_runs')
-- ORDER BY tablename;
--
-- Expected: only "authenticated users full access" policies remain, no anon.
