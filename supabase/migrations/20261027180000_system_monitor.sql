-- Kunden-Monitor: systems + checks + status view (Iteration 1, read-only).
-- Checks are written later via system_pruefung_eintragen (Iteration 3).

CREATE TABLE IF NOT EXISTS sales.systems (
  code text PRIMARY KEY
    CHECK (code ~ '^[A-Z]{2,6}-[0-9]{2}$'),
  name text NOT NULL,
  company_id uuid NOT NULL REFERENCES sales.companies(id) ON DELETE RESTRICT,
  kind text NOT NULL
    CHECK (kind IN (
      'Plattform',
      'Buchungs-App',
      'Kalender',
      'Postfach',
      'Automatisierung',
      'Datenbank'
    )),
  project_url text,
  vercel_project_id text,
  github_repo text,
  n8n_workflow_ids text[] NOT NULL DEFAULT '{}'::text[],
  supabase_ref text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS systems_company_idx
  ON sales.systems (company_id)
  WHERE active;

CREATE TABLE IF NOT EXISTS sales.system_checks (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  system_code text NOT NULL REFERENCES sales.systems(code) ON DELETE CASCADE,
  check_kind text NOT NULL,
  checked_at timestamptz NOT NULL DEFAULT now(),
  result text NOT NULL
    CHECK (result IN ('ok', 'warnung', 'fehler')),
  duration_ms integer
    CHECK (duration_ms IS NULL OR duration_ms >= 0),
  message text,
  action text
);

CREATE INDEX IF NOT EXISTS system_checks_system_checked_idx
  ON sales.system_checks (system_code, checked_at DESC);

CREATE INDEX IF NOT EXISTS system_checks_checked_idx
  ON sales.system_checks (checked_at DESC);

ALTER TABLE sales.systems ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales.system_checks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS systems_select ON sales.systems;
CREATE POLICY systems_select ON sales.systems
  FOR SELECT TO authenticated
  USING ((SELECT sales.is_app_user()));

DROP POLICY IF EXISTS system_checks_select ON sales.system_checks;
CREATE POLICY system_checks_select ON sales.system_checks
  FOR SELECT TO authenticated
  USING ((SELECT sales.is_app_user()));

GRANT SELECT ON sales.systems TO authenticated;
GRANT SELECT ON sales.system_checks TO authenticated;

-- Latest check per (system, check_kind); worst result across kinds;
-- ok older than 12h becomes warnung "veraltet".
CREATE OR REPLACE VIEW sales.v_system_status
WITH (security_invoker = true) AS
WITH latest AS (
  SELECT DISTINCT ON (sc.system_code, sc.check_kind)
    sc.system_code,
    sc.check_kind,
    sc.checked_at,
    sc.result,
    sc.message,
    sc.action
  FROM sales.system_checks sc
  ORDER BY sc.system_code, sc.check_kind, sc.checked_at DESC
),
ranked AS (
  SELECT
    l.*,
    CASE l.result
      WHEN 'fehler' THEN 3
      WHEN 'warnung' THEN 2
      WHEN 'ok' THEN 1
      ELSE 0
    END AS severity
  FROM latest l
),
agg AS (
  SELECT
    r.system_code,
    max(r.checked_at) AS last_checked_at,
    max(r.severity) AS max_severity,
    (
      SELECT r2.action
      FROM ranked r2
      WHERE r2.system_code = r.system_code
      ORDER BY r2.severity DESC, r2.checked_at DESC
      LIMIT 1
    ) AS action_from_worst,
    (
      SELECT r2.message
      FROM ranked r2
      WHERE r2.system_code = r.system_code
      ORDER BY r2.severity DESC, r2.checked_at DESC
      LIMIT 1
    ) AS message_from_worst
  FROM ranked r
  GROUP BY r.system_code
)
SELECT
  s.code,
  s.name,
  s.company_id,
  c.name AS company_name,
  s.kind,
  s.project_url,
  s.vercel_project_id,
  s.github_repo,
  s.n8n_workflow_ids,
  s.supabase_ref,
  s.active,
  s.created_at,
  a.last_checked_at,
  CASE
    WHEN a.system_code IS NULL THEN 'nicht_geprueft'::text
    WHEN a.max_severity = 3 THEN 'fehler'::text
    WHEN a.max_severity = 2 THEN 'warnung'::text
    WHEN a.last_checked_at < (now() - interval '12 hours') THEN 'warnung'::text
    ELSE 'ok'::text
  END AS status,
  CASE
    WHEN a.system_code IS NULL THEN NULL::text
    WHEN a.max_severity >= 2 THEN a.action_from_worst
    WHEN a.last_checked_at < (now() - interval '12 hours')
      THEN 'Prüfung älter als 12 Stunden — erneut prüfen'::text
    ELSE NULL::text
  END AS action,
  CASE
    WHEN a.system_code IS NULL THEN NULL::text
    WHEN a.max_severity >= 2 THEN a.message_from_worst
    WHEN a.last_checked_at < (now() - interval '12 hours')
      THEN 'Letzte Prüfung veraltet'::text
    ELSE a.message_from_worst
  END AS message
FROM sales.systems s
JOIN sales.companies c ON c.id = s.company_id
LEFT JOIN agg a ON a.system_code = s.code
WHERE s.active;

GRANT SELECT ON sales.v_system_status TO authenticated;

-- ---------------------------------------------------------------------------
-- Seed: three customers + Haller systems (idempotent by name / code)
-- ---------------------------------------------------------------------------

INSERT INTO sales.companies (name, website, pipeline_status, relationship)
SELECT
  'Haller Immobilienberatung',
  'https://vertrieb.haller-immobilien.de',
  'kunde'::sales.pipeline_status,
  'Kunde'::sales.relationship
WHERE NOT EXISTS (
  SELECT 1 FROM sales.companies WHERE name = 'Haller Immobilienberatung'
);

INSERT INTO sales.companies (name, pipeline_status, relationship)
SELECT
  'RAIS intern',
  'kunde'::sales.pipeline_status,
  'Kunde'::sales.relationship
WHERE NOT EXISTS (
  SELECT 1 FROM sales.companies WHERE name = 'RAIS intern'
);

INSERT INTO sales.companies (name, pipeline_status, relationship)
SELECT
  'Kode Webdesign',
  'kunde'::sales.pipeline_status,
  'Kunde'::sales.relationship
WHERE NOT EXISTS (
  SELECT 1 FROM sales.companies WHERE name = 'Kode Webdesign'
);

INSERT INTO sales.systems (
  code, name, company_id, kind, project_url
)
SELECT
  v.code,
  v.name,
  c.id,
  v.kind,
  v.project_url
FROM (
  VALUES
    (
      'HAL-01',
      'Haller Vertriebsplattform',
      'Plattform',
      'https://vertrieb.haller-immobilien.de'
    ),
    (
      'HAL-02',
      'Haller Termine',
      'Buchungs-App',
      'https://haller-immobilien-termine.vercel.app'
    ),
    (
      'HAL-03',
      'Haller Kalender vertrieb@',
      'Kalender',
      'https://haller-immobilien-termine.vercel.app'
    ),
    (
      'HAL-04',
      'Haller Postfach vertrieb@',
      'Postfach',
      NULL
    ),
    (
      'HAL-05',
      'Haller Automatisierung',
      'Automatisierung',
      NULL
    ),
    (
      'HAL-06',
      'Haller Datenbank',
      'Datenbank',
      NULL
    )
) AS v(code, name, kind, project_url)
JOIN sales.companies c ON c.name = 'Haller Immobilienberatung'
WHERE NOT EXISTS (
  SELECT 1 FROM sales.systems s WHERE s.code = v.code
);
