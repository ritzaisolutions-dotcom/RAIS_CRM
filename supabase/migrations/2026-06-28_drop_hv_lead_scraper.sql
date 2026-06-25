-- Rollback HV Lead Scraper tables (unused architecture removed)
BEGIN;

DROP TABLE IF EXISTS public.lead_staging;
DROP TABLE IF EXISTS public.scraped_cities;

COMMIT;
