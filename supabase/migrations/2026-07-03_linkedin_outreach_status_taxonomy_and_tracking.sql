-- Historical backfill: this migration was already applied remotely (version 20260703142756).
-- Kept in git for local history, but aligned to current end-state (no v_crm_contacts_flagged recreation).
BEGIN;

ALTER TABLE public.linkedin_outreach
  DROP CONSTRAINT IF EXISTS linkedin_outreach_status_check;

ALTER TABLE public.linkedin_outreach
  ADD CONSTRAINT linkedin_outreach_status_check
  CHECK (
    status = ANY (
      ARRAY[
        'connection_sent'::text,
        'connected'::text,
        'erstkontakt'::text,
        'follow_up_1'::text,
        'follow_up_2'::text,
        'ghost_1'::text,
        'ghost_2'::text,
        'ghost_3'::text,
        'ghost_4'::text,
        'termin_gesetzt'::text,
        'kein_interesse'::text,
        'nicht_erreichbar_final'::text,
        'disqualified'::text
      ]
    )
  );

CREATE TABLE IF NOT EXISTS public.linkedin_outreach_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  lead_id uuid REFERENCES public.linkedin_outreach (id) ON DELETE CASCADE,
  lead_name text,
  status_from text,
  status_to text NOT NULL,
  changed_at timestamptz DEFAULT now()
);

ALTER TABLE public.linkedin_outreach_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_full_access" ON public.linkedin_outreach_events;
CREATE POLICY "authenticated_full_access"
  ON public.linkedin_outreach_events
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.log_linkedin_outreach_status_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF (TG_OP = 'INSERT') OR (NEW.status IS DISTINCT FROM OLD.status) THEN
    INSERT INTO public.linkedin_outreach_events (lead_id, lead_name, status_from, status_to)
    VALUES (NEW.id, NEW.name, CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE OLD.status END, NEW.status);
  END IF;
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_linkedin_outreach_status ON public.linkedin_outreach;
CREATE TRIGGER trg_log_linkedin_outreach_status
BEFORE INSERT OR UPDATE ON public.linkedin_outreach
FOR EACH ROW
EXECUTE FUNCTION public.log_linkedin_outreach_status_change();

CREATE OR REPLACE VIEW public.v_linkedin_outreach_flagged AS
SELECT
  lo.id,
  lo.name,
  lo.firma,
  lo.telefon,
  lo.linkedin_name,
  lo.linkedin_url,
  lo.stadt,
  lo.region,
  lo.gewerk,
  lo.touch_stufe,
  lo.status,
  lo.notiz,
  lo.next_touch_date,
  lo.crm_contact_id,
  lo.created_at,
  lo.updated_at,
  EXISTS (
    SELECT 1
    FROM public.crm_contacts c
    WHERE lower(trim(c.firma)) = lower(trim(lo.firma))
       OR (
         c.telefon IS NOT NULL
         AND lo.telefon IS NOT NULL
         AND regexp_replace(c.telefon, '\D', '', 'g') = regexp_replace(lo.telefon, '\D', '', 'g')
       )
  ) AS is_duplicate
FROM public.linkedin_outreach lo;

CREATE OR REPLACE VIEW public.v_daily_kpi_dashboard AS
SELECT
  (d)::date AS tag,
  (
    SELECT count(*)
    FROM public.crm_session_events
    WHERE (crm_session_events.changed_at)::date = (d.d)::date
  ) AS call_status_wechsel,
  (
    SELECT count(*)
    FROM public.linkedin_outreach_events
    WHERE (linkedin_outreach_events.changed_at)::date = (d.d)::date
  ) AS dm_status_wechsel,
  (
    SELECT count(*)
    FROM public.crm_contacts
    WHERE crm_contacts.status_changed_at = to_char(((d.d)::date)::timestamptz, 'YYYY-MM-DD'::text)
      AND crm_contacts.status = 'set_appointment'::text
  ) AS termine_call,
  (
    SELECT count(*)
    FROM public.linkedin_outreach
    WHERE (linkedin_outreach.updated_at)::date = (d.d)::date
      AND linkedin_outreach.status = 'termin_gesetzt'::text
  ) AS termine_dm,
  (
    SELECT count(*)
    FROM public.crm_contacts
    WHERE crm_contacts.status_changed_at = to_char(((d.d)::date)::timestamptz, 'YYYY-MM-DD'::text)
      AND crm_contacts.status = 'closed'::text
  ) AS closes_call
FROM generate_series(
  (CURRENT_DATE - '30 days'::interval),
  (CURRENT_DATE)::timestamp without time zone,
  '1 day'::interval
) d(d)
ORDER BY ((d)::date) DESC;

COMMIT;
