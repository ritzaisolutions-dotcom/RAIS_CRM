-- Freigabeliste abgeschaltet (Entscheidung Kevin, 2026-11-25):
-- Jeder angemeldete Supabase-Auth-Nutzer gilt als CRM-Nutzer.
--
-- Achtung: Damit sehen und bearbeiten ALLE Konten im Auth-Projekt die
-- CRM-Daten — auch Kunden-/Portal-Konten und Testkonten, und jeder, der sich
-- registrieren kann, falls Sign-ups offen sind.
--
-- Rückweg: alte Definition wiederherstellen (sales.app_users bleibt bestehen):
--   SELECT auth.uid() IS NOT NULL AND EXISTS (
--     SELECT 1 FROM sales.app_users WHERE user_id = auth.uid());

CREATE OR REPLACE FUNCTION sales.is_app_user()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT auth.uid() IS NOT NULL;
$function$;
