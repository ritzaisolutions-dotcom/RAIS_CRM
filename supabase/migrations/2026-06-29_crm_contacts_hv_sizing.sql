-- HV Lead Sizing: Mitarbeiterzahl + verwalteter Objektbestand
BEGIN;

ALTER TABLE public.crm_contacts
  ADD COLUMN IF NOT EXISTS mitarbeiter_anzahl integer,
  ADD COLUMN IF NOT EXISTS objekte_bestand integer;

COMMIT;
