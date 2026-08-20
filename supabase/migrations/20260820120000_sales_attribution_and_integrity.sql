-- Phase 4: Zuordnung, Integrität und ein Korrekturweg für Touchpoints.
--
-- 1. `touchpoints.created_by` — wer hat angerufen? Bisher gab es im zentralen
--    Aktivitätsprotokoll eines Vertriebs-CRM überhaupt keine Nutzerspalte.
-- 2. Direkte INSERTs auf `touchpoints` unterbinden, damit `sales.log_touch`
--    (prüft Person↔Firma) nicht länger umgangen werden kann.
-- 3. `relationship` clientseitig sperren, damit es nicht mehr von
--    `pipeline_status` abweichen kann, plus CHECK, der die Paarung erzwingt.
-- 4. Stornoweg für Fehlklicks: Touchpoints bleiben append-only, können aber
--    als `voided` markiert und damit aus den KPIs genommen werden.
-- 5. Index auf die heisseste Prädikat-Kombination.

BEGIN;

-- ─── 1. Zuordnung ────────────────────────────────────────────────────────────

ALTER TABLE sales.touchpoints
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id);

COMMENT ON COLUMN sales.touchpoints.created_by IS
  'Auth-Nutzer, der den Touch protokolliert hat. NULL bei Zeilen aus der Zeit '
  'vor dieser Migration und bei Service-Role-Importen.';

CREATE INDEX IF NOT EXISTS touchpoints_created_by_idx
  ON sales.touchpoints (created_by, occurred_at DESC)
  WHERE created_by IS NOT NULL;

-- ─── 4a. Storno-Spalten (vor den Funktionen, die sie referenzieren) ──────────

ALTER TABLE sales.touchpoints
  ADD COLUMN IF NOT EXISTS voided_at timestamptz,
  ADD COLUMN IF NOT EXISTS voided_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS void_grund text;

COMMENT ON COLUMN sales.touchpoints.voided_at IS
  'Gesetzt, wenn der Touch als Fehleingabe storniert wurde. Die Zeile bleibt '
  'erhalten (append-only), zählt aber in keiner Kennzahl mehr mit.';

CREATE INDEX IF NOT EXISTS touchpoints_active_idx
  ON sales.touchpoints (company_id, occurred_at DESC)
  WHERE voided_at IS NULL;

-- ─── 2. Append-only-Trigger: Storno und Notiz-Redaktion zulassen ─────────────
--
-- Vorher erlaubte der Trigger `postgres` jede UPDATE, solange sich ausserhalb
-- von `notiz` nichts änderte — inklusive beliebigem Überschreiben der Notiz.
-- Jetzt sind exakt zwei Übergänge erlaubt: Notiz redigieren und stornieren.
CREATE OR REPLACE FUNCTION sales.deny_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  unchanged_except_allowed boolean;
BEGIN
  IF TG_OP = 'UPDATE' AND current_user = 'postgres' THEN
    unchanged_except_allowed := (
      (to_jsonb(NEW) - 'notiz' - 'voided_at' - 'voided_by' - 'void_grund')
      = (to_jsonb(OLD) - 'notiz' - 'voided_at' - 'voided_by' - 'void_grund')
    );

    -- Ein Storno darf nicht zurückgenommen werden: einmal storniert, bleibt
    -- storniert. Sonst wäre der Korrekturweg ein Schlupfloch, um KPIs
    -- nachträglich in beide Richtungen zu frisieren.
    IF unchanged_except_allowed
       AND NOT (OLD.voided_at IS NOT NULL AND NEW.voided_at IS NULL) THEN
      RETURN NEW;
    END IF;
  END IF;

  RAISE EXCEPTION 'sales.touchpoints ist append-only. % ist nicht erlaubt.', TG_OP
    USING ERRCODE = '42501';
END;
$$;

-- ─── 4b. Storno-RPC ─────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION sales.void_touch(
  p_touch_id bigint,
  p_grund text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  target_company uuid;
  already_voided timestamptz;
BEGIN
  IF NOT sales.is_app_user() THEN
    RAISE EXCEPTION 'Nicht autorisiert' USING ERRCODE = '42501';
  END IF;

  SELECT company_id, voided_at
  INTO target_company, already_voided
  FROM sales.touchpoints
  WHERE id = p_touch_id;

  IF target_company IS NULL THEN
    RAISE EXCEPTION 'Touchpoint nicht gefunden' USING ERRCODE = 'P0002';
  END IF;

  IF already_voided IS NOT NULL THEN
    RAISE EXCEPTION 'Touchpoint ist bereits storniert' USING ERRCODE = '22023';
  END IF;

  UPDATE sales.touchpoints
  SET voided_at = now(),
      voided_by = auth.uid(),
      void_grund = nullif(btrim(coalesce(p_grund, '')), '')
  WHERE id = p_touch_id;
END;
$$;

REVOKE ALL ON FUNCTION sales.void_touch(bigint, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION sales.void_touch(bigint, text) TO authenticated;

-- ─── 1b. Urheber automatisch setzen ─────────────────────────────────────────
--
-- Bewusst als BEFORE-INSERT-Trigger statt als Änderung an `log_touch` und
-- `set_pipeline_status`: beide schreiben Touchpoints, und jeder künftige
-- Schreibweg täte es auch. Der Trigger deckt alle ab, ohne dass zwei grosse
-- Funktionskörper hier wortgleich reproduziert werden müssen.
--
-- `auth.uid()` ist NULL für Service-Role- und `postgres`-Sitzungen ohne JWT —
-- Importe bleiben damit korrekt unattributiert statt fälschlich jemandem
-- zugeschrieben zu werden.
CREATE OR REPLACE FUNCTION sales.set_touch_author()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.created_by IS NULL THEN
    NEW.created_by := auth.uid();
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION sales.set_touch_author() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS touchpoints_set_author ON sales.touchpoints;
CREATE TRIGGER touchpoints_set_author
  BEFORE INSERT ON sales.touchpoints
  FOR EACH ROW
  EXECUTE FUNCTION sales.set_touch_author();

-- ─── 2b. Direkte Touchpoint-INSERTs entziehen ───────────────────────────────
--
-- Die App hat bisher direkt in die Tabelle geschrieben und damit die
-- Person↔Firma-Prüfung in `log_touch` umgangen; ein Touchpoint liess sich an
-- die Person einer *anderen* Firma hängen. Ab jetzt ist `log_touch` der einzige
-- Schreibweg.
REVOKE INSERT ON sales.touchpoints FROM authenticated;

DROP POLICY IF EXISTS touchpoints_insert ON sales.touchpoints;

-- ─── 3. relationship an pipeline_status binden ──────────────────────────────

REVOKE UPDATE (relationship) ON sales.companies FROM authenticated;

-- Bestehende Abweichungen zuerst normalisieren, sonst schlägt der CHECK fehl.
UPDATE sales.companies
SET relationship = 'Kunde'::sales.relationship
WHERE pipeline_status = 'kunde'::sales.pipeline_status
  AND relationship <> 'Kunde'::sales.relationship;

UPDATE sales.companies
SET relationship = 'Ausgeschlossen'::sales.relationship
WHERE pipeline_status = 'disqualified'::sales.pipeline_status
  AND relationship <> 'Ausgeschlossen'::sales.relationship;

UPDATE sales.companies
SET relationship = 'Prospect'::sales.relationship
WHERE pipeline_status NOT IN (
        'kunde'::sales.pipeline_status,
        'disqualified'::sales.pipeline_status
      )
  AND relationship = 'Ausgeschlossen'::sales.relationship;

ALTER TABLE sales.companies
  DROP CONSTRAINT IF EXISTS companies_relationship_matches_status;

ALTER TABLE sales.companies
  ADD CONSTRAINT companies_relationship_matches_status CHECK (
    CASE pipeline_status
      WHEN 'kunde'::sales.pipeline_status
        THEN relationship = 'Kunde'::sales.relationship
      WHEN 'disqualified'::sales.pipeline_status
        THEN relationship = 'Ausgeschlossen'::sales.relationship
      ELSE relationship IN (
        'Prospect'::sales.relationship,
        'Kunde'::sales.relationship
      )
    END
  );

-- ─── 3b. Recherche-Notizen schreibbar machen ────────────────────────────────
--
-- `companies.recherche` existiert seit der Baseline, war aber nie beschreibbar
-- und wurde nirgends angezeigt. Der LinkedIn-Import schreibt seinen gesamten
-- Kontext dorthin — bislang also in ein Feld, das niemand lesen oder pflegen
-- konnte.
GRANT UPDATE (recherche) ON sales.companies TO authenticated;
GRANT INSERT (recherche) ON sales.companies TO authenticated;

-- ─── 5. Index auf die heisseste Prädikat-Kombination ────────────────────────
--
-- `relationship` filtert v_call_liste, v_kunden_liste, analytics_dashboard und
-- drei count(*)-Abfragen im Workspace-Header — bisher jedes Mal Seq Scan.
CREATE INDEX IF NOT EXISTS companies_relationship_status_idx
  ON sales.companies (relationship, pipeline_status);


-- ─── 6. Geschäftszeitzone in der Datenbank ──────────────────────────────────
--
-- `CURRENT_DATE` löst in der Session-Zeitzone auf, und die ist auf Supabase
-- UTC. Zwischen 00:00 und 02:00 deutscher Zeit lieferte "fällig heute" damit
-- den Vortag — dieselbe Klasse Fehler, die auf App-Seite in `businessToday()`
-- behoben wurde. Die Datenbank muss dieselbe Vorstellung von "heute" haben.
--
-- Bewusst als Funktion und nicht via `ALTER DATABASE ... SET timezone`: das
-- Projekt teilt sich die Datenbank mit anderen Schemata, deren Verhalten hier
-- nicht verändert werden darf.

CREATE OR REPLACE FUNCTION sales.business_today()
RETURNS date LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT (now() AT TIME ZONE 'Europe/Berlin')::date;
$$;

CREATE OR REPLACE FUNCTION sales.business_day_start(p_day date DEFAULT NULL)
RETURNS timestamptz LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT (
    coalesce(p_day, (now() AT TIME ZONE 'Europe/Berlin')::date)::timestamp
    AT TIME ZONE 'Europe/Berlin'
  );
$$;

REVOKE ALL ON FUNCTION sales.business_today() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION sales.business_day_start(date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION sales.business_today() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION sales.business_day_start(date)
  TO authenticated, service_role;

-- ─── 7. Views: Stornos ausblenden, Zeitzone korrigieren ─────────────────────

CREATE OR REPLACE VIEW sales.v_company_status
WITH (security_invoker = true) AS
SELECT
  c.id AS company_id,
  c.name,
  c.stadt,
  c.bundesland,
  c.region,
  c.crm_system,
  c.anfragen_pro_woche,
  c.inserate_aktiv,
  c.relationship,
  c.website,
  c.facebook_url,
  c.instagram_url,
  c.recherche,
  t.ergebnis AS letztes_ergebnis,
  t.kanal AS letzter_kanal,
  t.occurred_at AS letzter_touch_at,
  sales.business_today()
    - (t.occurred_at AT TIME ZONE 'Europe/Berlin')::date AS tage_seit_touch,
  n.naechster_touch,
  (
    SELECT count(*)
    FROM sales.touchpoints x
    WHERE x.company_id = c.id
      AND x.voided_at IS NULL
  ) AS touches_gesamt
FROM sales.companies c
LEFT JOIN LATERAL (
  SELECT t2.*
  FROM sales.touchpoints t2
  WHERE t2.company_id = c.id
    AND t2.voided_at IS NULL
  ORDER BY t2.occurred_at DESC
  LIMIT 1
) t ON true
LEFT JOIN LATERAL (
  SELECT t3.naechster_touch
  FROM sales.touchpoints t3
  WHERE t3.company_id = c.id
    AND t3.naechster_touch IS NOT NULL
    AND t3.voided_at IS NULL
  ORDER BY t3.occurred_at DESC
  LIMIT 1
) n ON true;

CREATE OR REPLACE VIEW sales.v_call_liste
WITH (security_invoker = true) AS
SELECT
  s.company_id,
  s.name AS firma,
  p.name AS entscheider,
  s.bundesland,
  s.crm_system AS crm,
  s.anfragen_pro_woche AS "anfragen/woche",
  s.naechster_touch,
  c.pipeline_status AS status,
  s.tage_seit_touch,
  p.telefon AS tel,
  p.email,
  p.linkedin_url,
  s.inserate_aktiv,
  c.website,
  c.instagram_url,
  c.facebook_url
FROM sales.v_company_status s
JOIN sales.companies c ON c.id = s.company_id
LEFT JOIN LATERAL (
  SELECT pe.*
  FROM sales.people pe
  WHERE pe.company_id = s.company_id
  ORDER BY pe.ist_entscheider DESC, pe.created_at
  LIMIT 1
) p ON true
WHERE s.relationship = 'Prospect'::sales.relationship
ORDER BY
  (
    s.naechster_touch IS NOT NULL
    AND s.naechster_touch <= sales.business_today()
  ) DESC,
  s.naechster_touch,
  s.anfragen_pro_woche DESC NULLS LAST,
  s.inserate_aktiv DESC NULLS LAST;

-- ─── 8. KPI-Funktionen: stornierte Touches zählen nicht mehr mit ────────────
-- (Definitionen aus der Datenbank übernommen und gezielt gepatcht.)
CREATE OR REPLACE FUNCTION sales.analytics_dashboard(p_from timestamp with time zone, p_to timestamp with time zone)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'sales', 'public'
AS $function$
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
  WHERE t.voided_at IS NULL
    AND t.kanal IN ('call'::sales.touch_kanal, 'dm'::sales.touch_kanal)
    AND t.occurred_at >= p_from
    AND t.occurred_at < p_to
),
prior_base AS (
  SELECT t.*
  FROM sales.touchpoints t, params p
  WHERE t.voided_at IS NULL
    AND t.kanal IN ('call'::sales.touch_kanal, 'dm'::sales.touch_kanal)
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
    count(*) FILTER (WHERE naechster_touch = sales.business_today())::int AS due_today,
    count(*) FILTER (WHERE naechster_touch < sales.business_today())::int AS overdue,
    count(*) FILTER (WHERE status = 'callback'::sales.pipeline_status)::int AS callbacks
  FROM sales.v_call_liste
),
today_contacted AS (
  SELECT count(DISTINCT company_id)::int AS companies
  FROM sales.touchpoints
  WHERE voided_at IS NULL
    AND kanal IN ('call'::sales.touch_kanal, 'dm'::sales.touch_kanal)
    AND occurred_at >= sales.business_day_start()
    AND occurred_at < sales.business_day_start() + interval '1 day'
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
$function$

;

CREATE OR REPLACE FUNCTION sales.akquise_kpis(p_from timestamp with time zone, p_to timestamp with time zone)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'sales', 'public'
AS $function$
WITH base AS (
  SELECT *
  FROM sales.touchpoints t
  WHERE t.voided_at IS NULL
    AND t.kanal IN ('call'::sales.touch_kanal, 'dm'::sales.touch_kanal)
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
$function$

;

COMMIT;
