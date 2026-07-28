-- Akquise KPI RPC + website on list views
-- Applied remotely as sales_akquise_kpis_and_liste_website_v2

CREATE OR REPLACE FUNCTION sales.akquise_kpis(p_from timestamptz, p_to timestamptz)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = sales, public
AS $$
WITH base AS (
  SELECT *
  FROM sales.touchpoints t
  WHERE t.kanal IN ('call'::sales.touch_kanal, 'dm'::sales.touch_kanal)
    AND t.occurred_at >= p_from
    AND t.occurred_at < p_to
),
totals AS (
  SELECT
    count(*) FILTER (WHERE kanal = 'call') AS dials,
    count(*) FILTER (WHERE kanal = 'dm') AS dms,
    count(*) FILTER (WHERE ergebnis <> 'nicht_erreicht') AS connects,
    count(*) FILTER (WHERE ergebnis = ANY (ARRAY[
      'gespraech_ohne_termin'::sales.touch_ergebnis,
      'disqualifiziert'::sales.touch_ergebnis,
      'termin_gebucht'::sales.touch_ergebnis
    ])) AS conversations,
    count(*) FILTER (WHERE ergebnis = 'termin_gebucht') AS appointments,
    count(*) AS total_touches
  FROM base
),
series AS (
  SELECT
    date_trunc('day', occurred_at)::date AS bucket,
    count(*) FILTER (WHERE kanal = 'call') AS dials,
    count(*) FILTER (WHERE kanal = 'dm') AS dms,
    count(*) FILTER (WHERE ergebnis = 'termin_gebucht') AS appointments
  FROM base
  GROUP BY 1
  ORDER BY 1
),
status_mix AS (
  SELECT ergebnis::text AS ergebnis, count(*)::int AS n
  FROM base
  GROUP BY 1
  ORDER BY n DESC
)
SELECT jsonb_build_object(
  'from', p_from,
  'to', p_to,
  'totals', (
    SELECT jsonb_build_object(
      'dials', dials,
      'dms', dms,
      'connects', connects,
      'conversations', conversations,
      'appointments', appointments,
      'total_touches', total_touches,
      'connect_rate_pct', ROUND(100.0 * connects / NULLIF(dials + dms, 0), 1),
      'appointment_rate_pct', ROUND(100.0 * appointments / NULLIF(conversations, 0), 1)
    ) FROM totals
  ),
  'series', COALESCE((SELECT jsonb_agg(jsonb_build_object(
    'bucket', bucket,
    'dials', dials,
    'dms', dms,
    'appointments', appointments
  ) ORDER BY bucket) FROM series), '[]'::jsonb),
  'status_mix', COALESCE((SELECT jsonb_agg(jsonb_build_object(
    'ergebnis', ergebnis,
    'n', n
  ) ORDER BY n DESC) FROM status_mix), '[]'::jsonb)
);
$$;

REVOKE ALL ON FUNCTION sales.akquise_kpis(timestamptz, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION sales.akquise_kpis(timestamptz, timestamptz) FROM anon;
GRANT EXECUTE ON FUNCTION sales.akquise_kpis(timestamptz, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION sales.akquise_kpis(timestamptz, timestamptz) TO service_role;
