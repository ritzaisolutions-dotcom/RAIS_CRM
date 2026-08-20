-- ============================================================
-- Remove Versicherungsmakler leads from crm_contacts
-- Date: 2026-05-29
--
-- Run in Supabase SQL Editor (service role or authenticated).
-- ALWAYS run the PREVIEW block first and review results.
-- ============================================================

-- ── PREVIEW (run first) ─────────────────────────────────────
SELECT id, firma, gewerk, stadt, status, created
FROM public.crm_contacts
WHERE
  coalesce(gewerk, '') ILIKE '%versicherung%'
  OR coalesce(gewerk, '') ILIKE '%versicherungsmakler%'
  OR coalesce(firma, '') ILIKE '%versicherung%'
  OR coalesce(firma, '') ILIKE '%versicherungsmakler%'
  OR coalesce(firma, '') ILIKE '%versicherungsagentur%'
  OR coalesce(firma, '') ILIKE '%versicherungsbüro%'
  OR coalesce(firma, '') ILIKE '%versicherungsberatung%'
  OR coalesce(besonderheit, '') ILIKE '%versicherung%'
  OR coalesce(notiz, '') ILIKE '%versicherungsmakler%'
  OR coalesce(extra->>'hauptleistung', '') ILIKE '%versicherung%'
ORDER BY firma;

-- ── DELETE (only after preview looks correct) ───────────────
-- BEGIN;
--
-- DELETE FROM public.crm_contacts
-- WHERE
--   coalesce(gewerk, '') ILIKE '%versicherung%'
--   OR coalesce(gewerk, '') ILIKE '%versicherungsmakler%'
--   OR coalesce(firma, '') ILIKE '%versicherung%'
--   OR coalesce(firma, '') ILIKE '%versicherungsmakler%'
--   OR coalesce(firma, '') ILIKE '%versicherungsagentur%'
--   OR coalesce(firma, '') ILIKE '%versicherungsbüro%'
--   OR coalesce(firma, '') ILIKE '%versicherungsberatung%'
--   OR coalesce(besonderheit, '') ILIKE '%versicherung%'
--   OR coalesce(notiz, '') ILIKE '%versicherungsmakler%'
--   OR coalesce(extra->>'hauptleistung', '') ILIKE '%versicherung%';
--
-- COMMIT;
