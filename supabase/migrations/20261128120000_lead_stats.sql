-- Statistik-Seite (/statistik): Kontakte, Erreichbarkeit und Termine je Zeitraum,
-- Kanal, Quelle und ICP. Eine Funktion, ein Aufruf pro Seitenaufruf.
--
-- Regeln:
-- * Tage/Wochen/Monate nach Europe/Berlin, nicht UTC.
-- * Kontakt-Touch = call, email, dm, sms, meeting. Notizen, Aufgaben und reine
--   Status-Wechsel zählen nicht als Kontakt.
-- * Raten pro Lead, nicht pro Touch: fünf Anrufe bis zum Erreichen = 1 erreichter Lead.
-- * Termin = erster Touch eines Leads mit Ergebnis „termin_gebucht“ (Closing
--   schreibt ein zweites, das zählt nicht doppelt). Kanal des Termins = Kanal
--   dieses Touches, sonst der letzte Kontakt-Touch davor, sonst „ohne“.
-- * Security invoker: RLS auf touchpoints/companies gilt wie überall.

CREATE OR REPLACE FUNCTION sales.lead_stats(
  p_from date,
  p_to date,
  p_grain text DEFAULT 'week'
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO ''
AS $function$
WITH
params AS (
  SELECT
    p_from AS d_from,
    p_to AS d_to,
    (p_to - p_from) AS len,
    CASE WHEN p_grain IN ('week', 'month') THEN p_grain ELSE 'week' END AS grain
),
t AS (
  SELECT
    tp.id,
    tp.company_id,
    tp.kanal::text AS kanal,
    tp.ergebnis::text AS ergebnis,
    tp.occurred_at,
    (tp.occurred_at AT TIME ZONE 'Europe/Berlin')::date AS tag,
    tp.kanal::text IN ('call', 'email', 'dm', 'sms', 'meeting') AS kontakt
  FROM sales.touchpoints tp
  WHERE tp.voided_at IS NULL
    AND tp.kanal::text NOT IN ('note', 'task', 'engagement')
),
termin_first AS (
  SELECT DISTINCT ON (company_id) company_id, occurred_at, tag, kanal, kontakt
  FROM t
  WHERE ergebnis = 'termin_gebucht'
  ORDER BY company_id, occurred_at, id
),
termine AS (
  SELECT
    f.company_id,
    f.tag,
    CASE WHEN f.kontakt THEN f.kanal ELSE coalesce((
      SELECT t2.kanal FROM t t2
      WHERE t2.company_id = f.company_id AND t2.kontakt AND t2.occurred_at <= f.occurred_at
      ORDER BY t2.occurred_at DESC LIMIT 1
    ), 'ohne') END AS kanal,
    (SELECT min(t3.tag) FROM t t3
      WHERE t3.company_id = f.company_id AND t3.kontakt AND t3.occurred_at <= f.occurred_at) AS erster_kontakt,
    (SELECT count(DISTINCT t4.kanal) FROM t t4
      WHERE t4.company_id = f.company_id AND t4.kontakt AND t4.occurred_at <= f.occurred_at) AS kanaele
  FROM termin_first f
),
periods AS (
  SELECT 'cur' AS p, d_from AS f, d_to AS e FROM params
  UNION ALL
  SELECT 'prev', d_from - len, d_from FROM params
),
-- Lead × Zeitraum × Kanal
lk AS (
  SELECT
    pr.p,
    t.company_id,
    t.kanal,
    count(*)::int AS touches,
    bool_or(t.ergebnis IN ('erreicht_ohne_gespraech', 'gespraech_ohne_termin', 'disqualifiziert', 'termin_gebucht')) AS erreicht,
    bool_or(t.ergebnis IN ('gespraech_ohne_termin', 'disqualifiziert', 'termin_gebucht')) AS gespraech
  FROM t
  JOIN periods pr ON t.tag >= pr.f AND t.tag < pr.e
  WHERE t.kontakt
  GROUP BY 1, 2, 3
),
-- Lead × Zeitraum (über alle Kanäle)
lp AS (
  SELECT p, company_id, sum(touches)::int AS touches, bool_or(erreicht) AS erreicht, bool_or(gespraech) AS gespraech
  FROM lk
  GROUP BY 1, 2
),
tp_period AS (
  SELECT pr.p, tm.*
  FROM termine tm
  JOIN periods pr ON tm.tag >= pr.f AND tm.tag < pr.e
),
-- Ein Termin setzt Kontakt, Erreichen und Gespräch voraus — auch wenn nur der
-- Status gesetzt wurde (z. B. Notion-Import ohne Anruf-Touch).
lp2 AS (
  SELECT
    coalesce(lp.p, x.p) AS p,
    coalesce(lp.company_id, x.company_id) AS company_id,
    coalesce(lp.touches, 0) AS touches,
    coalesce(lp.erreicht, false) OR x.company_id IS NOT NULL AS erreicht,
    coalesce(lp.gespraech, false) OR x.company_id IS NOT NULL AS gespraech,
    x.company_id IS NOT NULL AS termin
  FROM lp
  FULL JOIN tp_period x ON x.p = lp.p AND x.company_id = lp.company_id
),
totals AS (
  SELECT
    pr.p,
    coalesce((SELECT sum(touches) FROM lp2 WHERE lp2.p = pr.p), 0)::int AS touches,
    (SELECT count(*) FROM lp2 WHERE lp2.p = pr.p)::int AS kontaktiert,
    (SELECT count(*) FROM lp2 WHERE lp2.p = pr.p AND lp2.erreicht)::int AS erreicht,
    (SELECT count(*) FROM lp2 WHERE lp2.p = pr.p AND lp2.gespraech)::int AS gespraeche,
    (SELECT count(*) FROM lp2 WHERE lp2.p = pr.p AND lp2.termin)::int AS termine
  FROM periods pr
),
kanal_stats AS (
  SELECT
    k.kanal,
    coalesce(a.kontaktiert, 0) AS kontaktiert,
    coalesce(a.erreicht, 0) AS erreicht,
    coalesce(a.gespraeche, 0) AS gespraeche,
    coalesce(a.touches, 0) AS touches,
    coalesce(b.termine, 0) AS termine
  FROM (
    SELECT kanal FROM lk WHERE p = 'cur'
    UNION
    SELECT kanal FROM tp_period WHERE p = 'cur'
  ) k
  LEFT JOIN (
    SELECT kanal, count(*)::int AS kontaktiert,
      count(*) FILTER (WHERE erreicht)::int AS erreicht,
      count(*) FILTER (WHERE gespraech)::int AS gespraeche,
      sum(touches)::int AS touches
    FROM lk WHERE p = 'cur' GROUP BY kanal
  ) a ON a.kanal = k.kanal
  LEFT JOIN (
    SELECT kanal, count(*)::int AS termine FROM tp_period WHERE p = 'cur' GROUP BY kanal
  ) b ON b.kanal = k.kanal
),
-- Leads im Zeitraum (kontaktiert oder Termin) mit Quelle + ICP
leads_cur AS (
  SELECT
    coalesce(c.quelle::text, 'ohne') AS quelle,
    coalesce(c.icp, 'offen') AS icp,
    true AS kontaktiert,
    l.erreicht,
    l.gespraech,
    l.termin
  FROM lp2 l
  JOIN sales.companies c ON c.id = l.company_id
  WHERE l.p = 'cur'
),
buckets AS (
  SELECT gs::date AS b
  FROM params,
    generate_series(
      date_trunc(params.grain, params.d_from::timestamp),
      (params.d_to - 1)::timestamp,
      ('1 ' || params.grain)::interval
    ) gs
),
trend AS (
  SELECT
    bk.b,
    count(t.id) FILTER (WHERE t.kanal = 'call')::int AS call,
    count(t.id) FILTER (WHERE t.kanal = 'email')::int AS email,
    count(t.id) FILTER (WHERE t.kanal = 'dm')::int AS dm,
    count(t.id) FILTER (WHERE t.kanal IN ('sms', 'meeting'))::int AS sonstige,
    (SELECT count(*) FROM tp_period x, params
      WHERE x.p = 'cur' AND date_trunc(params.grain, x.tag::timestamp)::date = bk.b)::int AS termine
  FROM buckets bk
  CROSS JOIN params
  LEFT JOIN t ON t.kontakt
    AND t.tag >= params.d_from AND t.tag < params.d_to
    AND date_trunc(params.grain, t.tag::timestamp)::date = bk.b
  GROUP BY bk.b
)
SELECT jsonb_build_object(
  'from', (SELECT d_from FROM params),
  'to', (SELECT d_to FROM params),
  'grain', (SELECT grain FROM params),
  'current', (SELECT to_jsonb(x) - 'p' FROM totals x WHERE x.p = 'cur'),
  'prior', (SELECT to_jsonb(x) - 'p' FROM totals x WHERE x.p = 'prev'),
  'median_tage_bis_termin', (
    SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY tag - erster_kontakt)
    FROM tp_period WHERE p = 'cur' AND erster_kontakt IS NOT NULL
  ),
  'termine_mehrkanal', (SELECT count(*) FROM tp_period WHERE p = 'cur' AND kanaele > 1),
  'termine_ohne_kanal', (SELECT count(*) FROM tp_period WHERE p = 'cur' AND kanal = 'ohne'),
  'kanaele', coalesce((SELECT jsonb_agg(to_jsonb(k) ORDER BY k.termine DESC, k.kontaktiert DESC) FROM kanal_stats k), '[]'::jsonb),
  'quellen', coalesce((
    SELECT jsonb_agg(jsonb_build_object(
      'key', quelle, 'kontaktiert', kontaktiert, 'erreicht', erreicht, 'gespraeche', gespraeche, 'termine', termine
    ) ORDER BY termine DESC, kontaktiert DESC)
    FROM (
      SELECT quelle,
        count(*) FILTER (WHERE kontaktiert)::int AS kontaktiert,
        count(*) FILTER (WHERE erreicht)::int AS erreicht,
        count(*) FILTER (WHERE gespraech)::int AS gespraeche,
        count(*) FILTER (WHERE termin)::int AS termine
      FROM leads_cur GROUP BY quelle
    ) q
  ), '[]'::jsonb),
  'icp', coalesce((
    SELECT jsonb_agg(jsonb_build_object(
      'key', icp, 'kontaktiert', kontaktiert, 'erreicht', erreicht, 'gespraeche', gespraeche, 'termine', termine
    ) ORDER BY termine DESC, kontaktiert DESC)
    FROM (
      SELECT icp,
        count(*) FILTER (WHERE kontaktiert)::int AS kontaktiert,
        count(*) FILTER (WHERE erreicht)::int AS erreicht,
        count(*) FILTER (WHERE gespraech)::int AS gespraeche,
        count(*) FILTER (WHERE termin)::int AS termine
      FROM leads_cur GROUP BY icp
    ) i
  ), '[]'::jsonb),
  'trend', coalesce((SELECT jsonb_agg(to_jsonb(tr) ORDER BY tr.b) FROM trend tr), '[]'::jsonb)
);
$function$;

REVOKE ALL ON FUNCTION sales.lead_stats(date, date, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION sales.lead_stats(date, date, text) TO authenticated;
