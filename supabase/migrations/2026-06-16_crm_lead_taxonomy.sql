-- Lead taxonomy: origin, temperature, socials, lebensbereich on crm_contacts

ALTER TABLE public.crm_contacts
  ADD COLUMN IF NOT EXISTS lead_origin text,
  ADD COLUMN IF NOT EXISTS lead_temp text,
  ADD COLUMN IF NOT EXISTS is_external boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS lebensbereich text,
  ADD COLUMN IF NOT EXISTS socials jsonb DEFAULT '{}'::jsonb;

-- Backfill lead_origin from technical source
UPDATE public.crm_contacts SET lead_origin = 'scraped'
WHERE lead_origin IS NULL AND (
  coalesce(source, '') ILIKE '%firecrawl%'
  OR coalesce(source, '') ILIKE '%gelbeseiten%'
);

UPDATE public.crm_contacts SET lead_origin = 'import'
WHERE lead_origin IS NULL AND (
  coalesce(source, '') ILIKE '%prospekt%'
  OR coalesce(source, '') ILIKE '%hausverwaltung%'
);

UPDATE public.crm_contacts SET lead_origin = 'manual'
WHERE lead_origin IS NULL;

-- Backfill lead_temp
UPDATE public.crm_contacts SET lead_temp = 'cold'
WHERE lead_temp IS NULL
  AND status = 'neu'
  AND (
    touches IS NULL
    OR touches = '[]'::jsonb
    OR NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(touches) t
      WHERE coalesce(t->>'status', '') <> ''
         OR coalesce(t->>'notiz', '') <> ''
         OR coalesce(t->>'datum', '') <> ''
    )
  );

UPDATE public.crm_contacts SET lead_temp = 'warm'
WHERE lead_temp IS NULL
  AND status NOT IN ('neu', 'gewonnen', 'disqualified', 'archiviert', 'ghost', 'nicht_passend');

UPDATE public.crm_contacts SET lead_temp = 'hot'
WHERE lead_temp IS NULL AND status = 'gewonnen';

UPDATE public.crm_contacts SET lead_temp = 'cold'
WHERE lead_temp IS NULL;

-- Hausverwaltung → Lebensbereich Immobilien
UPDATE public.crm_contacts SET lebensbereich = 'Immobilien'
WHERE lebensbereich IS NULL AND gewerk ILIKE 'hausverwaltung%';

-- Migrate socials from extra
UPDATE public.crm_contacts SET socials = socials || jsonb_strip_nulls(jsonb_build_object(
  'facebook', nullif(trim(extra->>'facebook'), ''),
  'instagram', nullif(trim(extra->>'instagram'), ''),
  'linkedin', nullif(trim(extra->>'linkedin'), '')
))
WHERE extra IS NOT NULL
  AND (
    coalesce(extra->>'facebook', '') <> ''
    OR coalesce(extra->>'instagram', '') <> ''
    OR coalesce(extra->>'linkedin', '') <> ''
  );
