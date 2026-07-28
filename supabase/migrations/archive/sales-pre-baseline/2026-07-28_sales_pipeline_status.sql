-- Legacy call pipeline status on companies (separate from touch ergebnis)
DO $$ BEGIN
  CREATE TYPE sales.pipeline_status AS ENUM (
    'neu',
    'kein_anschluss_1',
    'kein_anschluss_2',
    'kein_anschluss_3',
    'kein_anschluss_4',
    'kein_anschluss_5',
    'callback',
    'disqualified',
    'set_appointment',
    'closed',
    'kunde'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE sales.companies
  ADD COLUMN IF NOT EXISTS pipeline_status sales.pipeline_status NOT NULL DEFAULT 'neu'::sales.pipeline_status;

-- Backfill from legacy crm_contacts via notion_id
UPDATE sales.companies c
SET pipeline_status = CASE
  WHEN c.relationship = 'Kunde' THEN 'kunde'::sales.pipeline_status
  WHEN lc.status IN (
    'neu','kein_anschluss_1','kein_anschluss_2','kein_anschluss_3',
    'kein_anschluss_4','kein_anschluss_5','callback','disqualified',
    'set_appointment','closed'
  ) THEN lc.status::sales.pipeline_status
  WHEN lc.status IN ('dq') THEN 'disqualified'::sales.pipeline_status
  WHEN lc.status IN ('gatekeeper') THEN 'callback'::sales.pipeline_status
  WHEN c.relationship = 'Ausgeschlossen' THEN 'disqualified'::sales.pipeline_status
  ELSE c.pipeline_status
END
FROM public.crm_contacts lc
WHERE c.notion_id = lc.id;

UPDATE sales.companies
SET pipeline_status = 'kunde'::sales.pipeline_status
WHERE relationship = 'Kunde' AND pipeline_status IS DISTINCT FROM 'kunde'::sales.pipeline_status;

DROP VIEW IF EXISTS sales.v_call_liste;
DROP VIEW IF EXISTS sales.v_kunden_liste;

CREATE VIEW sales.v_call_liste
WITH (security_invoker = true)
AS
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
  (s.naechster_touch IS NOT NULL AND s.naechster_touch <= CURRENT_DATE) DESC,
  s.naechster_touch,
  s.anfragen_pro_woche DESC NULLS LAST,
  s.inserate_aktiv DESC NULLS LAST;

CREATE VIEW sales.v_kunden_liste
WITH (security_invoker = true)
AS
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
WHERE s.relationship = 'Kunde'::sales.relationship
ORDER BY s.name;

GRANT SELECT ON TABLE sales.v_call_liste TO authenticated;
GRANT SELECT ON TABLE sales.v_kunden_liste TO authenticated;

CREATE OR REPLACE FUNCTION sales.pipeline_status_counts()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = sales, public
AS $$
  SELECT COALESCE(
    jsonb_agg(jsonb_build_object('status', pipeline_status::text, 'n', n) ORDER BY n DESC),
    '[]'::jsonb
  )
  FROM (
    SELECT pipeline_status, count(*)::int AS n
    FROM sales.companies
    GROUP BY 1
  ) s;
$$;

REVOKE ALL ON FUNCTION sales.pipeline_status_counts() FROM PUBLIC;
REVOKE ALL ON FUNCTION sales.pipeline_status_counts() FROM anon;
GRANT EXECUTE ON FUNCTION sales.pipeline_status_counts() TO authenticated;
GRANT EXECUTE ON FUNCTION sales.pipeline_status_counts() TO service_role;
