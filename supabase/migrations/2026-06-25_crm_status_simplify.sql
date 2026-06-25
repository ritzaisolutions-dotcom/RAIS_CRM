-- Vereinfachte Calling-Status (8 Stück)
BEGIN;

UPDATE public.crm_contacts SET status = 'kein_anschluss' WHERE status IN ('kein_anschluss_2', 'no_show', 'email_nurture');
UPDATE public.crm_contacts SET status = 'set_appointment' WHERE status IN ('demo_termin', 'interessiert', 'door_open');
UPDATE public.crm_contacts SET status = 'closed' WHERE status = 'gewonnen';
UPDATE public.crm_contacts SET status = 'mofo' WHERE status = 'ghost';
UPDATE public.crm_contacts SET status = 'disqualified' WHERE status IN ('nicht_passend', 'archiviert');

COMMIT;
