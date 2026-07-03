-- Remove deprecated full-row overlap view and keep slim payload for CRM duplicate flag sync.
BEGIN;

DROP VIEW IF EXISTS public.v_crm_contacts_flagged;

CREATE OR REPLACE VIEW public.v_crm_contacts_dm_overlap AS
SELECT
  c.id,
  EXISTS (
    SELECT 1
    FROM public.linkedin_outreach lo
    WHERE lower(trim(lo.firma)) = lower(trim(c.firma))
       OR (
         c.telefon IS NOT NULL
         AND lo.telefon IS NOT NULL
         AND regexp_replace(c.telefon, '\D', '', 'g') = regexp_replace(lo.telefon, '\D', '', 'g')
       )
  ) AS is_duplicate
FROM public.crm_contacts c;

COMMIT;
