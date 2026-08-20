-- Kein-Anschluss-Stufen 1–5: Legacy-Status normalisieren
BEGIN;
UPDATE public.crm_contacts SET status = 'kein_anschluss_1' WHERE status = 'kein_anschluss';
COMMIT;
