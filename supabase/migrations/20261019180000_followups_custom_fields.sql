-- Follow-up task arts, custom field EAV, meta_ads + company linkedin_url.
-- Touchpoints stay append-only via sales.log_touch.
-- Also bootstraps voided_at + business_today if missing (older deploys).

-- ---------------------------------------------------------------------------
-- 0. Prerequisites (idempotent)
-- ---------------------------------------------------------------------------
ALTER TABLE sales.touchpoints
  ADD COLUMN IF NOT EXISTS voided_at timestamptz,
  ADD COLUMN IF NOT EXISTS voided_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS void_grund text;

CREATE OR REPLACE FUNCTION sales.business_today()
RETURNS date
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT (timezone('Europe/Berlin', now()))::date;
$$;

CREATE OR REPLACE FUNCTION sales.business_day_start(p_day date DEFAULT NULL)
RETURNS timestamptz
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT timezone(
    'Europe/Berlin',
    ((coalesce(p_day, (timezone('Europe/Berlin', now()))::date))::text || ' 00:00:00')::timestamp
  );
$$;

REVOKE ALL ON FUNCTION sales.business_today() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION sales.business_day_start(date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION sales.business_today() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION sales.business_day_start(date)
  TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 1. Tasks: art + email_preset; create_task sets naechster only for follow_up
-- ---------------------------------------------------------------------------
ALTER TABLE sales.tasks
  ADD COLUMN IF NOT EXISTS art text NOT NULL DEFAULT 'follow_up'
    CHECK (art IN ('follow_up', 'email', 'sonstiges')),
  ADD COLUMN IF NOT EXISTS email_preset text
    CHECK (
      email_preset IS NULL
      OR email_preset IN ('info', 'ueber_uns', 'frei')
    );

CREATE OR REPLACE FUNCTION sales.create_task(
  p_company_id uuid,
  p_titel text,
  p_due_on date,
  p_person_id uuid DEFAULT NULL,
  p_notiz text DEFAULT NULL,
  p_art text DEFAULT 'follow_up',
  p_email_preset text DEFAULT NULL,
  p_set_naechster boolean DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = sales, public
AS $$
DECLARE
  new_id uuid;
  v_art text := coalesce(nullif(trim(p_art), ''), 'follow_up');
  v_set_next boolean;
  v_naechster date;
BEGIN
  IF NOT sales.is_app_user() THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  IF v_art NOT IN ('follow_up', 'email', 'sonstiges') THEN
    RAISE EXCEPTION 'invalid task art';
  END IF;
  IF p_person_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM sales.people
    WHERE id = p_person_id AND company_id = p_company_id
  ) THEN
    RAISE EXCEPTION 'person does not belong to company';
  END IF;

  v_set_next := coalesce(p_set_naechster, v_art = 'follow_up');
  v_naechster := CASE WHEN v_set_next THEN p_due_on ELSE NULL END;

  INSERT INTO sales.tasks (
    company_id, person_id, titel, notiz, due_on, created_by, art, email_preset
  )
  VALUES (
    p_company_id,
    p_person_id,
    trim(p_titel),
    NULLIF(trim(p_notiz), ''),
    p_due_on,
    auth.uid(),
    v_art,
    NULLIF(trim(p_email_preset), '')
  )
  RETURNING id INTO new_id;

  PERFORM sales.log_touch(
    p_company_id,
    'task'::sales.touch_kanal,
    'kein_ergebnis'::sales.touch_ergebnis,
    p_person_id,
    'Aufgabe angelegt: ' || trim(p_titel)
      || COALESCE(E'\n' || NULLIF(trim(p_notiz), ''), ''),
    v_naechster,
    NULL
  );

  RETURN new_id;
END;
$$;

REVOKE ALL ON FUNCTION sales.create_task(
  uuid, text, date, uuid, text, text, text, boolean
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION sales.create_task(
  uuid, text, date, uuid, text, text, text, boolean
) TO authenticated, service_role;

-- Drop old overload if present (5-arg signature from prior migration).
DROP FUNCTION IF EXISTS sales.create_task(uuid, text, date, uuid, text);

CREATE OR REPLACE VIEW sales.v_open_tasks
WITH (security_invoker = true)
AS
SELECT
  t.id,
  t.company_id,
  c.name AS firma,
  t.titel,
  t.due_on,
  t.status,
  t.person_id,
  t.notiz,
  t.created_at,
  t.art,
  t.email_preset
FROM sales.tasks t
JOIN sales.companies c ON c.id = t.company_id
WHERE t.status = 'offen';

GRANT SELECT ON sales.v_open_tasks TO authenticated;

-- ---------------------------------------------------------------------------
-- 2. Fixed company columns: meta_ads, linkedin_url
-- ---------------------------------------------------------------------------
ALTER TABLE sales.companies
  ADD COLUMN IF NOT EXISTS meta_ads boolean,
  ADD COLUMN IF NOT EXISTS linkedin_url text;

GRANT UPDATE (meta_ads, linkedin_url, inserate_aktiv) ON sales.companies
  TO authenticated;

-- ---------------------------------------------------------------------------
-- 3. Custom field definitions + values (Notion-like freeform)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sales.custom_field_defs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  field_type text NOT NULL
    CHECK (field_type IN (
      'single_select', 'multi_select', 'text', 'number', 'url', 'phone'
    )),
  options jsonb NOT NULL DEFAULT '[]'::jsonb,
  active boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);

CREATE TABLE IF NOT EXISTS sales.custom_field_values (
  company_id uuid NOT NULL REFERENCES sales.companies(id) ON DELETE CASCADE,
  field_id uuid NOT NULL REFERENCES sales.custom_field_defs(id) ON DELETE CASCADE,
  value_text text,
  value_number numeric,
  value_json jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (company_id, field_id)
);

CREATE INDEX IF NOT EXISTS custom_field_values_field_idx
  ON sales.custom_field_values (field_id);

ALTER TABLE sales.custom_field_defs ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales.custom_field_values ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS custom_field_defs_all ON sales.custom_field_defs;
CREATE POLICY custom_field_defs_all ON sales.custom_field_defs
  FOR ALL TO authenticated
  USING ((SELECT sales.is_app_user()))
  WITH CHECK ((SELECT sales.is_app_user()));

DROP POLICY IF EXISTS custom_field_values_all ON sales.custom_field_values;
CREATE POLICY custom_field_values_all ON sales.custom_field_values
  FOR ALL TO authenticated
  USING ((SELECT sales.is_app_user()))
  WITH CHECK ((SELECT sales.is_app_user()));

GRANT SELECT, INSERT, UPDATE, DELETE ON sales.custom_field_defs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON sales.custom_field_values TO authenticated;

CREATE OR REPLACE FUNCTION sales.reorder_custom_field_defs(p_ordered_ids uuid[])
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = sales, public
AS $$
DECLARE
  i int;
BEGIN
  IF NOT sales.is_app_user() THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  IF p_ordered_ids IS NULL THEN
    RETURN;
  END IF;
  FOR i IN 1 .. coalesce(array_length(p_ordered_ids, 1), 0) LOOP
    UPDATE sales.custom_field_defs
    SET sort_order = i - 1
    WHERE id = p_ordered_ids[i];
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION sales.reorder_custom_field_defs(uuid[]) TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. Expose stadt / mitarbeiter / meta_ads / company linkedin on call list
-- ---------------------------------------------------------------------------
-- Column order changed vs older deploys → DROP + recreate (incl. kunden).
DROP VIEW IF EXISTS sales.v_call_liste;
DROP VIEW IF EXISTS sales.v_kunden_liste;
DROP VIEW IF EXISTS sales.v_company_status;

CREATE VIEW sales.v_company_status
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
  c.mitarbeiterzahl,
  c.meta_ads,
  c.linkedin_url AS company_linkedin_url,
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
    AND t3.voided_at IS NULL
    AND t3.naechster_touch IS NOT NULL
  ORDER BY t3.occurred_at DESC
  LIMIT 1
) n ON true;

CREATE VIEW sales.v_call_liste
WITH (security_invoker = true) AS
SELECT
  s.company_id,
  s.name AS firma,
  p.name AS entscheider,
  s.bundesland,
  s.stadt,
  s.crm_system AS crm,
  s.anfragen_pro_woche AS "anfragen/woche",
  s.naechster_touch,
  c.pipeline_status AS status,
  s.tage_seit_touch,
  p.telefon AS tel,
  p.email,
  coalesce(p.linkedin_url, s.company_linkedin_url) AS linkedin_url,
  s.inserate_aktiv,
  s.mitarbeiterzahl,
  s.meta_ads,
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

CREATE VIEW sales.v_kunden_liste
WITH (security_invoker = true) AS
SELECT
  s.company_id,
  s.name AS firma,
  p.name AS entscheider,
  s.bundesland,
  s.stadt,
  s.crm_system AS crm,
  s.anfragen_pro_woche AS "anfragen/woche",
  s.naechster_touch,
  c.pipeline_status AS status,
  s.tage_seit_touch,
  p.telefon AS tel,
  p.email,
  coalesce(p.linkedin_url, s.company_linkedin_url) AS linkedin_url,
  s.inserate_aktiv,
  s.mitarbeiterzahl,
  s.meta_ads,
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

GRANT SELECT ON sales.v_call_liste TO authenticated;
GRANT SELECT ON sales.v_company_status TO authenticated;
GRANT SELECT ON sales.v_kunden_liste TO authenticated;
