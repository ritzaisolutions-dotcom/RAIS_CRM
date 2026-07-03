-- Move call KPI counts to timestamp-based crm_call_events stream.
BEGIN;

CREATE OR REPLACE VIEW public.v_daily_kpi_dashboard AS
SELECT
  (d)::date AS tag,
  (
    SELECT count(*)
    FROM public.crm_call_events e
    WHERE e.event_type = 'status_changed'
      AND (e.occurred_at)::date = (d.d)::date
  ) AS call_status_wechsel,
  (
    SELECT count(*)
    FROM public.linkedin_outreach_events e
    WHERE (e.changed_at)::date = (d.d)::date
  ) AS dm_status_wechsel,
  (
    SELECT count(*)
    FROM public.crm_call_events e
    WHERE e.event_type = 'appointment_set'
      AND (e.occurred_at)::date = (d.d)::date
  ) AS termine_call,
  (
    SELECT count(*)
    FROM public.linkedin_outreach e
    WHERE (e.updated_at)::date = (d.d)::date
      AND e.status = 'termin_gesetzt'::text
  ) AS termine_dm,
  (
    SELECT count(*)
    FROM public.crm_call_events e
    WHERE e.event_type = 'close_won'
      AND (e.occurred_at)::date = (d.d)::date
  ) AS closes_call
FROM generate_series(
  (CURRENT_DATE - '30 days'::interval),
  (CURRENT_DATE)::timestamp without time zone,
  '1 day'::interval
) d(d)
ORDER BY ((d)::date) DESC;

COMMIT;
