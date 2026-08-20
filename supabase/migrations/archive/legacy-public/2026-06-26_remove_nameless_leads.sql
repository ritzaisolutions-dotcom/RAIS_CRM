-- Remove junk leads: empty firma or Google Maps placeholder "Adresse nachschlagen"
-- Applied via Supabase SQL on 2026-06-26 (16 rows removed)

-- PREVIEW:
-- SELECT id, firma, stadt, status FROM public.crm_contacts
-- WHERE trim(coalesce(firma, '')) = '' OR firma ILIKE '%Adresse nachschlagen%';

DELETE FROM public.crm_contacts
WHERE trim(coalesce(firma, '')) = ''
   OR firma ILIKE '%Adresse nachschlagen%';
