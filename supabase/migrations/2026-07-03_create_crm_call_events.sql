-- Timestamp-based call event stream for dashboard KPIs and channel performance.
BEGIN;

CREATE TABLE IF NOT EXISTS public.crm_call_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  contact_id text REFERENCES public.crm_contacts (id) ON DELETE SET NULL,
  contact_name text,
  event_type text NOT NULL CHECK (event_type = ANY (ARRAY[
    'touch_logged'::text,
    'status_changed'::text,
    'appointment_set'::text,
    'close_won'::text
  ])),
  status_from text,
  status_to text,
  touch_label text,
  result_bucket text NOT NULL DEFAULT 'conversation'::text CHECK (result_bucket = ANY (ARRAY[
    'no_answer'::text,
    'conversation'::text,
    'appointment'::text,
    'close'::text,
    'negative'::text
  ])),
  source text NOT NULL DEFAULT 'manual'::text,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS crm_call_events_occurred_at_idx
  ON public.crm_call_events (occurred_at DESC);

CREATE INDEX IF NOT EXISTS crm_call_events_contact_id_idx
  ON public.crm_call_events (contact_id);

CREATE INDEX IF NOT EXISTS crm_call_events_event_type_occurred_at_idx
  ON public.crm_call_events (event_type, occurred_at DESC);

ALTER TABLE public.crm_call_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_full_access" ON public.crm_call_events;
CREATE POLICY "authenticated_full_access"
  ON public.crm_call_events
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

COMMIT;
