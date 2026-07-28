-- Action-oriented analytics dashboard for authenticated sales users.
-- Touch funnel and current company pipeline remain separate concepts.
CREATE OR REPLACE FUNCTION sales.analytics_dashboard(
  p_from timestamptz,
  p_to timestamptz
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = sales, public
AS $$
WITH
params AS (
  SELECT
    p_from AS current_from,
    p_to AS current_to,
    p_to - p_from AS period_length,
    CASE
      WHEN p_to - p_from <= interval '2 days' THEN 'hour'
      WHEN p_to - p_from <= interval '45 days' THEN 'day'
      WHEN p_to - p_from <= interval '120 days' THEN 'week'
      ELSE 'month'
    END AS grain
),
current_base AS (
  SELECT t.*
  FROM sales.touchpoints t
  WHERE t.kanal IN ('call'::sales.touch_kanal, 'dm'::sales.touch_kanal)
    AND t.occurred_at >= p_from
    AND t.occurred_at < p_to
),
prior_base AS (
  SELECT t.*
  FROM sales.touchpoints t, params p
  WHERE t.kanal IN ('call'::sales.touch_kanal, 'dm'::sales.touch_kanal)
    AND t.occurred_at >= p.current_from - p.period_length
    AND t.occurred_at < p.current_from
),
current_totals AS (
  SELECT
    count(*)::int AS attempts,
    count(*) FILTER (WHERE kanal = 'call')::int AS dials,
    count(*) FILTER (WHERE kanal = 'dm')::int AS dms,
    count(*) FILTER (WHERE ergebnis <> 'nicht_erreicht')::int AS connects,
    count(*) FILTER (WHERE ergebnis = ANY (ARRAY[
      'gespraech_ohne_termin'::sales.touch_ergebnis,
      'disqualifiziert'::sales.touch_ergebnis,
      'termin_gebucht'::sales.touch_ergebnis
    ]))::int AS conversations,
    count(*) FILTER (WHERE ergebnis = 'termin_gebucht')::int AS appointments
  FROM current_base
),
prior_totals AS (
  SELECT
    count(*)::int AS attempts,
    count(*) FILTER (WHERE ergebnis <> 'nicht_erreicht')::int AS connects,
    count(*) FILTER (WHERE ergebnis = ANY (ARRAY[
      'gespraech_ohne_termin'::sales.touch_ergebnis,
      'disqualifiziert'::sales.touch_ergebnis,
      'termin_gebucht'::sales.touch_ergebnis
    ]))::int AS conversations,
    count(*) FILTER (WHERE ergebnis = 'termin_gebucht')::int AS appointments
  FROM prior_base
),
channel_stats AS (
  SELECT
    channel.kanal,
    count(b.id)::int AS attempts,
    count(b.id) FILTER (WHERE b.ergebnis <> 'nicht_erreicht')::int AS connects,
    count(b.id) FILTER (WHERE b.ergebnis = ANY (ARRAY[
      'gespraech_ohne_termin'::sales.touch_ergebnis,
      'disqualifiziert'::sales.touch_ergebnis,
      'termin_gebucht'::sales.touch_ergebnis
    ]))::int AS conversations,
    count(b.id) FILTER (WHERE b.ergebnis = 'termin_gebucht')::int AS appointments
  FROM (
    VALUES ('call'::sales.touch_kanal), ('dm'::sales.touch_kanal)
  ) AS channel(kanal)
  LEFT JOIN current_base b ON b.kanal = channel.kanal
  GROUP BY channel.kanal
),
trend AS (
  SELECT
    date_trunc((SELECT grain FROM params), occurred_at) AS bucket,
    count(*) FILTER (WHERE kanal = 'call')::int AS dials,
    count(*) FILTER (WHERE kanal = 'dm')::int AS dms,
    count(*) FILTER (WHERE ergebnis = 'termin_gebucht')::int AS appointments
  FROM current_base
  GROUP BY 1
  ORDER BY 1
),
today_actions AS (
  SELECT
    count(*) FILTER (WHERE naechster_touch = CURRENT_DATE)::int AS due_today,
    count(*) FILTER (WHERE naechster_touch < CURRENT_DATE)::int AS overdue,
    count(*) FILTER (WHERE status = 'callback'::sales.pipeline_status)::int AS callbacks
  FROM sales.v_call_liste
),
today_contacted AS (
  SELECT count(DISTINCT company_id)::int AS companies
  FROM sales.touchpoints
  WHERE kanal IN ('call'::sales.touch_kanal, 'dm'::sales.touch_kanal)
    AND occurred_at >= CURRENT_DATE
    AND occurred_at < CURRENT_DATE + interval '1 day'
),
pipeline AS (
  SELECT pipeline_status, count(*)::int AS n
  FROM sales.companies
  WHERE relationship = 'Prospect'::sales.relationship
  GROUP BY pipeline_status
),
company_counts AS (
  SELECT
    count(*) FILTER (WHERE relationship = 'Kunde'::sales.relationship)::int AS customers,
    count(*) FILTER (
      WHERE relationship = 'Ausgeschlossen'::sales.relationship
         OR pipeline_status = 'disqualified'::sales.pipeline_status
    )::int AS disqualified
  FROM sales.companies
),
commercial AS (
  SELECT
    count(*)::int AS total_opportunities,
    count(*) FILTER (WHERE stage = 'offen'::sales.opp_stage)::int AS open_opportunities,
    count(*) FILTER (WHERE stage = 'angebot_raus'::sales.opp_stage)::int AS open_offers,
    count(*) FILTER (
      WHERE stage = 'gewonnen'::sales.opp_stage
        AND closed_at >= p_from AND closed_at < p_to
    )::int AS won,
    count(*) FILTER (
      WHERE stage = 'verloren'::sales.opp_stage
        AND closed_at >= p_from AND closed_at < p_to
    )::int AS lost,
    COALESCE(sum(setup_preis) FILTER (
      WHERE stage = 'gewonnen'::sales.opp_stage
        AND closed_at >= p_from AND closed_at < p_to
    ), 0) AS won_setup_revenue,
    COALESCE(sum(retainer_monatlich) FILTER (
      WHERE stage = 'gewonnen'::sales.opp_stage
        AND closed_at >= p_from AND closed_at < p_to
    ), 0) AS won_monthly_retainer,
    COALESCE(sum(setup_preis) FILTER (
      WHERE stage IN ('offen'::sales.opp_stage, 'angebot_raus'::sales.opp_stage)
    ), 0) AS open_setup_value
  FROM sales.opportunities
)
SELECT jsonb_build_object(
  'from', p_from,
  'to', p_to,
  'grain', (SELECT grain FROM params),
  'summary', (
    SELECT jsonb_build_object(
      'attempts', c.attempts,
      'dials', c.dials,
      'dms', c.dms,
      'connects', c.connects,
      'conversations', c.conversations,
      'appointments', c.appointments,
      'connect_rate_pct', round(100.0 * c.connects / NULLIF(c.attempts, 0), 1),
      'appointment_rate_pct', round(100.0 * c.appointments / NULLIF(c.conversations, 0), 1),
      'prior', jsonb_build_object(
        'attempts', p.attempts,
        'connects', p.connects,
        'conversations', p.conversations,
        'appointments', p.appointments,
        'connect_rate_pct', round(100.0 * p.connects / NULLIF(p.attempts, 0), 1),
        'appointment_rate_pct', round(100.0 * p.appointments / NULLIF(p.conversations, 0), 1)
      )
    )
    FROM current_totals c CROSS JOIN prior_totals p
  ),
  'funnel', (
    SELECT jsonb_build_array(
      jsonb_build_object('key', 'attempts', 'value', attempts, 'conversion_pct', 100),
      jsonb_build_object(
        'key', 'connects',
        'value', connects,
        'conversion_pct', round(100.0 * connects / NULLIF(attempts, 0), 1)
      ),
      jsonb_build_object(
        'key', 'conversations',
        'value', conversations,
        'conversion_pct', round(100.0 * conversations / NULLIF(connects, 0), 1)
      ),
      jsonb_build_object(
        'key', 'appointments',
        'value', appointments,
        'conversion_pct', round(100.0 * appointments / NULLIF(conversations, 0), 1)
      )
    )
    FROM current_totals
  ),
  'channels', COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'channel', kanal::text,
      'attempts', attempts,
      'connects', connects,
      'conversations', conversations,
      'appointments', appointments,
      'connect_rate_pct', round(100.0 * connects / NULLIF(attempts, 0), 1),
      'appointment_rate_pct', round(100.0 * appointments / NULLIF(conversations, 0), 1)
    ) ORDER BY kanal)
    FROM channel_stats
  ), '[]'::jsonb),
  'trend', COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'bucket', bucket,
      'dials', dials,
      'dms', dms,
      'appointments', appointments
    ) ORDER BY bucket)
    FROM trend
  ), '[]'::jsonb),
  'actions', (
    SELECT jsonb_build_object(
      'due_today', a.due_today,
      'overdue', a.overdue,
      'callbacks', a.callbacks,
      'contacted_today', t.companies
    )
    FROM today_actions a CROSS JOIN today_contacted t
  ),
  'pipeline', COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'status', pipeline_status::text,
      'n', n
    ) ORDER BY n DESC)
    FROM pipeline
  ), '[]'::jsonb),
  'company_counts', (
    SELECT jsonb_build_object(
      'customers', customers,
      'disqualified', disqualified
    )
    FROM company_counts
  ),
  'commercial', (
    SELECT jsonb_build_object(
      'total_opportunities', total_opportunities,
      'open_opportunities', open_opportunities,
      'open_offers', open_offers,
      'won', won,
      'lost', lost,
      'won_setup_revenue', won_setup_revenue,
      'won_monthly_retainer', won_monthly_retainer,
      'open_setup_value', open_setup_value,
      'close_rate_pct', round(100.0 * won / NULLIF(won + lost, 0), 1)
    )
    FROM commercial
  )
);
$$;

REVOKE ALL ON FUNCTION sales.analytics_dashboard(timestamptz, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION sales.analytics_dashboard(timestamptz, timestamptz) FROM anon;
GRANT EXECUTE ON FUNCTION sales.analytics_dashboard(timestamptz, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION sales.analytics_dashboard(timestamptz, timestamptz) TO service_role;
