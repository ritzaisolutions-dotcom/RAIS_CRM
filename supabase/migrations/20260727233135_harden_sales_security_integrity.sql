-- Harden the exposed sales schema around the app_users allowlist.
-- This migration intentionally replaces broad grants and all permissive policies.

CREATE OR REPLACE FUNCTION sales.is_app_user()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM sales.app_users
      WHERE user_id = auth.uid()
    );
$$;

REVOKE ALL ON SCHEMA sales FROM anon;
REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA sales FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA sales FROM anon, authenticated;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA sales FROM PUBLIC, anon, authenticated;

ALTER DEFAULT PRIVILEGES IN SCHEMA sales
  REVOKE ALL ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA sales
  REVOKE ALL ON SEQUENCES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA sales
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;

GRANT USAGE ON SCHEMA sales TO authenticated, service_role;

DO $$
DECLARE
  policy_record record;
  table_record record;
  view_record record;
BEGIN
  FOR policy_record IN
    SELECT tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'sales'
  LOOP
    EXECUTE format(
      'DROP POLICY IF EXISTS %I ON sales.%I',
      policy_record.policyname,
      policy_record.tablename
    );
  END LOOP;

  FOR table_record IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'sales'
      AND c.relkind = 'r'
  LOOP
    EXECUTE format('ALTER TABLE sales.%I ENABLE ROW LEVEL SECURITY', table_record.relname);
  END LOOP;

  FOR view_record IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'sales'
      AND c.relkind = 'v'
  LOOP
    EXECUTE format(
      'ALTER VIEW sales.%I SET (security_invoker = true)',
      view_record.relname
    );
  END LOOP;
END;
$$;

CREATE POLICY companies_select ON sales.companies
  FOR SELECT TO authenticated
  USING ((SELECT sales.is_app_user()));
CREATE POLICY companies_insert ON sales.companies
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT sales.is_app_user()));
CREATE POLICY companies_update ON sales.companies
  FOR UPDATE TO authenticated
  USING ((SELECT sales.is_app_user()))
  WITH CHECK ((SELECT sales.is_app_user()));

CREATE POLICY people_select ON sales.people
  FOR SELECT TO authenticated
  USING ((SELECT sales.is_app_user()));
CREATE POLICY people_insert ON sales.people
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT sales.is_app_user()));
CREATE POLICY people_update ON sales.people
  FOR UPDATE TO authenticated
  USING ((SELECT sales.is_app_user()))
  WITH CHECK ((SELECT sales.is_app_user()));
CREATE POLICY people_delete ON sales.people
  FOR DELETE TO authenticated
  USING ((SELECT sales.is_app_user()));

CREATE POLICY touchpoints_select ON sales.touchpoints
  FOR SELECT TO authenticated
  USING ((SELECT sales.is_app_user()));
CREATE POLICY touchpoints_insert ON sales.touchpoints
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT sales.is_app_user()));

CREATE POLICY opportunities_select ON sales.opportunities
  FOR SELECT TO authenticated
  USING ((SELECT sales.is_app_user()));
CREATE POLICY opportunities_insert ON sales.opportunities
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT sales.is_app_user()));
CREATE POLICY opportunities_update ON sales.opportunities
  FOR UPDATE TO authenticated
  USING ((SELECT sales.is_app_user()))
  WITH CHECK ((SELECT sales.is_app_user()));

CREATE POLICY company_qualification_audit_select
  ON sales.company_qualification_audit
  FOR SELECT TO authenticated
  USING ((SELECT sales.is_app_user()));
CREATE POLICY documents_select ON sales.documents
  FOR SELECT TO authenticated
  USING ((SELECT sales.is_app_user()));
CREATE POLICY knowledge_select ON sales.knowledge
  FOR SELECT TO authenticated
  USING ((SELECT sales.is_app_user()));
CREATE POLICY knowledge_evidence_select ON sales.knowledge_evidence
  FOR SELECT TO authenticated
  USING ((SELECT sales.is_app_user()));
CREATE POLICY territories_select ON sales.territories
  FOR SELECT TO authenticated
  USING ((SELECT sales.is_app_user()));
CREATE POLICY ref_stadt_bundesland_select ON sales.ref_stadt_bundesland
  FOR SELECT TO authenticated
  USING ((SELECT sales.is_app_user()));

GRANT SELECT, INSERT ON sales.companies TO authenticated;
GRANT UPDATE (
  name,
  stadt,
  telefon,
  website,
  instagram_url,
  facebook_url,
  mitarbeiterzahl,
  crm_system,
  anfragen_pro_woche,
  inserate_aktiv,
  relationship
) ON sales.companies TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON sales.people TO authenticated;
GRANT SELECT, INSERT ON sales.touchpoints TO authenticated;
GRANT SELECT, INSERT, UPDATE ON sales.opportunities TO authenticated;
GRANT SELECT ON
  sales.company_qualification_audit,
  sales.documents,
  sales.knowledge,
  sales.knowledge_evidence,
  sales.territories,
  sales.ref_stadt_bundesland
TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE sales.touchpoints_id_seq TO authenticated;

GRANT SELECT ON
  sales.v_abbruchgruende,
  sales.v_akquise_daily,
  sales.v_akquise_funnel,
  sales.v_call_liste,
  sales.v_company_status,
  sales.v_knowledge,
  sales.v_kunden_liste
TO authenticated;

REVOKE ALL ON FUNCTION sales.is_app_user() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION sales.is_app_user() TO authenticated, service_role;

-- Touchpoints remain append-only. Only a postgres-owned SECURITY DEFINER
-- operation may redact the note, and no other column may change.
CREATE OR REPLACE FUNCTION sales.deny_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND current_user = 'postgres'
     AND (to_jsonb(NEW) - 'notiz') = (to_jsonb(OLD) - 'notiz') THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'sales.touchpoints ist append-only. % ist nicht erlaubt.', TG_OP
    USING ERRCODE = '42501';
END;
$$;

CREATE OR REPLACE FUNCTION sales.gdpr_anonymize(p_company_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  short_id text := substr(replace(p_company_id::text, '-', ''), 1, 8);
BEGIN
  IF NOT sales.is_app_user() THEN
    RAISE EXCEPTION 'Nicht autorisiert' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM sales.companies WHERE id = p_company_id
  ) THEN
    RAISE EXCEPTION 'Firma nicht gefunden' USING ERRCODE = 'P0002';
  END IF;

  UPDATE sales.companies
  SET
    name = 'ANON-' || short_id,
    stadt = NULL,
    website = NULL,
    telefon = NULL,
    quell_url = NULL,
    notion_url = NULL,
    notion_id = NULL,
    recherche = NULL,
    facebook_url = NULL,
    instagram_url = NULL,
    relationship = 'Ausgeschlossen'::sales.relationship,
    pipeline_status = 'disqualified'::sales.pipeline_status,
    updated_at = now()
  WHERE id = p_company_id;

  UPDATE sales.people
  SET
    name = 'Anonym',
    email = NULL,
    telefon = NULL,
    linkedin_url = NULL,
    rolle = NULL,
    notion_id = NULL
  WHERE company_id = p_company_id;

  UPDATE sales.touchpoints
  SET notiz = NULL
  WHERE company_id = p_company_id;

  UPDATE sales.documents
  SET
    content_text = NULL,
    quelllink = NULL,
    titel = 'ANON-' || short_id,
    notion_id = NULL
  WHERE company_id = p_company_id;

  UPDATE sales.knowledge_evidence
  SET notiz = NULL, quelllink = NULL
  WHERE company_id = p_company_id;

  UPDATE sales.opportunities
  SET close_grund = NULL
  WHERE company_id = p_company_id;
END;
$$;

DROP FUNCTION IF EXISTS sales.log_touch(
  text,
  sales.touch_kanal,
  sales.touch_ergebnis,
  text,
  date,
  sales.abbruchgrund
);

CREATE OR REPLACE FUNCTION sales.log_touch(
  p_company_id uuid,
  p_kanal sales.touch_kanal,
  p_ergebnis sales.touch_ergebnis DEFAULT 'kein_ergebnis'::sales.touch_ergebnis,
  p_person_id uuid DEFAULT NULL,
  p_notiz text DEFAULT NULL,
  p_naechster date DEFAULT NULL,
  p_abbruch sales.abbruchgrund DEFAULT NULL
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  selected_person_id uuid := p_person_id;
  touch_id bigint;
BEGIN
  IF NOT sales.is_app_user() THEN
    RAISE EXCEPTION 'Nicht autorisiert' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM sales.companies WHERE id = p_company_id
  ) THEN
    RAISE EXCEPTION 'Firma nicht gefunden' USING ERRCODE = 'P0002';
  END IF;

  IF selected_person_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM sales.people
       WHERE id = selected_person_id
         AND company_id = p_company_id
     ) THEN
    RAISE EXCEPTION 'Kontakt gehört nicht zur Firma'
      USING ERRCODE = '23503';
  END IF;

  IF selected_person_id IS NULL THEN
    SELECT id
    INTO selected_person_id
    FROM sales.people
    WHERE company_id = p_company_id
    ORDER BY ist_entscheider DESC, created_at
    LIMIT 1;
  END IF;

  INSERT INTO sales.touchpoints (
    company_id,
    person_id,
    kanal,
    ergebnis,
    notiz,
    naechster_touch,
    abbruchgrund
  )
  VALUES (
    p_company_id,
    selected_person_id,
    p_kanal,
    p_ergebnis,
    p_notiz,
    p_naechster,
    p_abbruch
  )
  RETURNING id INTO touch_id;

  RETURN touch_id;
END;
$$;

CREATE OR REPLACE FUNCTION sales.create_company(
  p_name text,
  p_stadt text DEFAULT NULL,
  p_telefon text DEFAULT NULL,
  p_website text DEFAULT NULL,
  p_instagram_url text DEFAULT NULL,
  p_facebook_url text DEFAULT NULL,
  p_crm_system sales.crm_system DEFAULT NULL,
  p_anfragen_pro_woche integer DEFAULT NULL,
  p_pipeline_status sales.pipeline_status DEFAULT 'neu'::sales.pipeline_status,
  p_person_name text DEFAULT NULL,
  p_person_email text DEFAULT NULL,
  p_person_telefon text DEFAULT NULL,
  p_person_linkedin_url text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  company_id uuid;
  normalized_name text := nullif(btrim(p_name), '');
  normalized_person_name text := nullif(btrim(p_person_name), '');
  company_relationship sales.relationship;
BEGIN
  IF NOT sales.is_app_user() THEN
    RAISE EXCEPTION 'Nicht autorisiert' USING ERRCODE = '42501';
  END IF;

  IF normalized_name IS NULL THEN
    RAISE EXCEPTION 'Firma-Name ist Pflicht' USING ERRCODE = '22023';
  END IF;

  IF normalized_person_name IS NULL
     AND (
       nullif(btrim(p_person_email), '') IS NOT NULL
       OR nullif(btrim(p_person_telefon), '') IS NOT NULL
       OR nullif(btrim(p_person_linkedin_url), '') IS NOT NULL
     ) THEN
    RAISE EXCEPTION 'Kontakt-Name ist Pflicht' USING ERRCODE = '22023';
  END IF;

  company_relationship := CASE
    WHEN p_pipeline_status = 'kunde'::sales.pipeline_status
      THEN 'Kunde'::sales.relationship
    WHEN p_pipeline_status = 'disqualified'::sales.pipeline_status
      THEN 'Ausgeschlossen'::sales.relationship
    ELSE 'Prospect'::sales.relationship
  END;

  INSERT INTO sales.companies (
    name,
    stadt,
    telefon,
    website,
    instagram_url,
    facebook_url,
    crm_system,
    anfragen_pro_woche,
    pipeline_status,
    relationship
  )
  VALUES (
    normalized_name,
    nullif(btrim(p_stadt), ''),
    nullif(btrim(p_telefon), ''),
    nullif(btrim(p_website), ''),
    nullif(btrim(p_instagram_url), ''),
    nullif(btrim(p_facebook_url), ''),
    p_crm_system,
    p_anfragen_pro_woche,
    p_pipeline_status,
    company_relationship
  )
  RETURNING id INTO company_id;

  IF normalized_person_name IS NOT NULL THEN
    INSERT INTO sales.people (
      company_id,
      name,
      email,
      telefon,
      linkedin_url,
      ist_entscheider
    )
    VALUES (
      company_id,
      normalized_person_name,
      nullif(lower(btrim(p_person_email)), ''),
      nullif(btrim(p_person_telefon), ''),
      nullif(btrim(p_person_linkedin_url), ''),
      true
    );
  END IF;

  RETURN company_id;
END;
$$;

CREATE OR REPLACE FUNCTION sales.set_pipeline_status(
  p_company_id uuid,
  p_pipeline_status sales.pipeline_status,
  p_kanal sales.touch_kanal DEFAULT 'call'::sales.touch_kanal,
  p_naechster_touch date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  selected_person_id uuid;
  selected_relationship sales.relationship;
  selected_result sales.touch_ergebnis;
  selected_next_touch date := coalesce(p_naechster_touch, current_date + 2);
  status_label text;
BEGIN
  IF NOT sales.is_app_user() THEN
    RAISE EXCEPTION 'Nicht autorisiert' USING ERRCODE = '42501';
  END IF;

  IF p_kanal NOT IN (
    'call'::sales.touch_kanal,
    'dm'::sales.touch_kanal,
    'status_change'::sales.touch_kanal
  ) THEN
    RAISE EXCEPTION 'Ungültiger Kanal für Pipeline-Status'
      USING ERRCODE = '22023';
  END IF;

  UPDATE sales.companies
  SET
    pipeline_status = p_pipeline_status,
    relationship = CASE
      WHEN p_pipeline_status = 'kunde'::sales.pipeline_status
        THEN 'Kunde'::sales.relationship
      WHEN p_pipeline_status = 'disqualified'::sales.pipeline_status
        THEN 'Ausgeschlossen'::sales.relationship
      WHEN relationship = 'Kunde'::sales.relationship
        THEN 'Kunde'::sales.relationship
      ELSE 'Prospect'::sales.relationship
    END
  WHERE id = p_company_id
  RETURNING relationship INTO selected_relationship;

  IF selected_relationship IS NULL THEN
    RAISE EXCEPTION 'Firma nicht gefunden' USING ERRCODE = 'P0002';
  END IF;

  SELECT id
  INTO selected_person_id
  FROM sales.people
  WHERE company_id = p_company_id
  ORDER BY ist_entscheider DESC, created_at
  LIMIT 1;

  selected_result := CASE
    WHEN p_pipeline_status IN (
      'kein_anschluss_1'::sales.pipeline_status,
      'kein_anschluss_2'::sales.pipeline_status,
      'kein_anschluss_3'::sales.pipeline_status,
      'kein_anschluss_4'::sales.pipeline_status,
      'kein_anschluss_5'::sales.pipeline_status
    ) THEN 'nicht_erreicht'::sales.touch_ergebnis
    WHEN p_pipeline_status = 'callback'::sales.pipeline_status
      THEN 'erreicht_ohne_gespraech'::sales.touch_ergebnis
    WHEN p_pipeline_status = 'disqualified'::sales.pipeline_status
      THEN 'disqualifiziert'::sales.touch_ergebnis
    WHEN p_pipeline_status IN (
      'set_appointment'::sales.pipeline_status,
      'closed'::sales.pipeline_status,
      'kunde'::sales.pipeline_status
    ) THEN 'termin_gebucht'::sales.touch_ergebnis
    ELSE 'kein_ergebnis'::sales.touch_ergebnis
  END;

  status_label := CASE p_pipeline_status
    WHEN 'neu'::sales.pipeline_status THEN 'Neu'
    WHEN 'kein_anschluss_1'::sales.pipeline_status THEN 'Kein Anschluss (1)'
    WHEN 'kein_anschluss_2'::sales.pipeline_status THEN 'Kein Anschluss (2)'
    WHEN 'kein_anschluss_3'::sales.pipeline_status THEN 'Kein Anschluss (3)'
    WHEN 'kein_anschluss_4'::sales.pipeline_status THEN 'Kein Anschluss (4)'
    WHEN 'kein_anschluss_5'::sales.pipeline_status THEN 'Kein Anschluss (5)'
    WHEN 'callback'::sales.pipeline_status THEN 'Rückruf'
    WHEN 'disqualified'::sales.pipeline_status THEN 'Disqualifiziert'
    WHEN 'set_appointment'::sales.pipeline_status THEN 'Setting'
    WHEN 'closed'::sales.pipeline_status THEN 'Closing'
    WHEN 'kunde'::sales.pipeline_status THEN 'Kunde'
  END;

  INSERT INTO sales.touchpoints (
    company_id,
    person_id,
    kanal,
    ergebnis,
    notiz,
    naechster_touch,
    abbruchgrund
  )
  VALUES (
    p_company_id,
    selected_person_id,
    p_kanal,
    selected_result,
    'Pipeline → ' || status_label,
    selected_next_touch,
    NULL
  );

  RETURN jsonb_build_object(
    'naechster_touch', selected_next_touch,
    'relationship', selected_relationship
  );
END;
$$;

CREATE OR REPLACE FUNCTION sales.upsert_person_atomic(
  p_person_id uuid,
  p_company_id uuid,
  p_name text,
  p_rolle text DEFAULT NULL,
  p_email text DEFAULT NULL,
  p_telefon text DEFAULT NULL,
  p_linkedin_url text DEFAULT NULL,
  p_ist_entscheider boolean DEFAULT false
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  saved_person_id uuid;
  normalized_name text := nullif(btrim(p_name), '');
BEGIN
  IF NOT sales.is_app_user() THEN
    RAISE EXCEPTION 'Nicht autorisiert' USING ERRCODE = '42501';
  END IF;

  IF normalized_name IS NULL THEN
    RAISE EXCEPTION 'Kontakt-Name ist Pflicht' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM sales.companies WHERE id = p_company_id
  ) THEN
    RAISE EXCEPTION 'Firma nicht gefunden' USING ERRCODE = 'P0002';
  END IF;

  IF p_person_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM sales.people
       WHERE id = p_person_id
         AND company_id = p_company_id
     ) THEN
    RAISE EXCEPTION 'Kontakt nicht gefunden' USING ERRCODE = 'P0002';
  END IF;

  IF p_ist_entscheider THEN
    UPDATE sales.people
    SET ist_entscheider = false
    WHERE company_id = p_company_id
      AND ist_entscheider = true
      AND (p_person_id IS NULL OR id <> p_person_id);
  END IF;

  IF p_person_id IS NULL THEN
    INSERT INTO sales.people (
      company_id,
      name,
      rolle,
      email,
      telefon,
      linkedin_url,
      ist_entscheider
    )
    VALUES (
      p_company_id,
      normalized_name,
      nullif(btrim(p_rolle), ''),
      nullif(lower(btrim(p_email)), ''),
      nullif(btrim(p_telefon), ''),
      nullif(btrim(p_linkedin_url), ''),
      p_ist_entscheider
    )
    RETURNING id INTO saved_person_id;
  ELSE
    UPDATE sales.people
    SET
      name = normalized_name,
      rolle = nullif(btrim(p_rolle), ''),
      email = nullif(lower(btrim(p_email)), ''),
      telefon = nullif(btrim(p_telefon), ''),
      linkedin_url = nullif(btrim(p_linkedin_url), ''),
      ist_entscheider = p_ist_entscheider
    WHERE id = p_person_id
      AND company_id = p_company_id
    RETURNING id INTO saved_person_id;
  END IF;

  RETURN saved_person_id;
END;
$$;

REVOKE ALL ON FUNCTION sales.gdpr_anonymize(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION sales.log_touch(
  uuid,
  sales.touch_kanal,
  sales.touch_ergebnis,
  uuid,
  text,
  date,
  sales.abbruchgrund
) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION sales.create_company(
  text,
  text,
  text,
  text,
  text,
  text,
  sales.crm_system,
  integer,
  sales.pipeline_status,
  text,
  text,
  text,
  text
) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION sales.set_pipeline_status(
  uuid,
  sales.pipeline_status,
  sales.touch_kanal,
  date
) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION sales.upsert_person_atomic(
  uuid,
  uuid,
  text,
  text,
  text,
  text,
  text,
  boolean
) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION sales.deny_mutation() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION sales.gdpr_anonymize(uuid)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION sales.log_touch(
  uuid,
  sales.touch_kanal,
  sales.touch_ergebnis,
  uuid,
  text,
  date,
  sales.abbruchgrund
) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION sales.create_company(
  text,
  text,
  text,
  text,
  text,
  text,
  sales.crm_system,
  integer,
  sales.pipeline_status,
  text,
  text,
  text,
  text
) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION sales.set_pipeline_status(
  uuid,
  sales.pipeline_status,
  sales.touch_kanal,
  date
) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION sales.upsert_person_atomic(
  uuid,
  uuid,
  text,
  text,
  text,
  text,
  text,
  boolean
) TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION sales.akquise_kpis(timestamptz, timestamptz)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION sales.analytics_dashboard(timestamptz, timestamptz)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION sales.pipeline_status_counts()
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION sales.clean_stadt(text)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION sales.icp_rating(integer, integer)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION sales.norm(text)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION sales.primary_person(text)
  TO authenticated, service_role;

COMMENT ON FUNCTION sales.gdpr_anonymize(uuid) IS
  'Art.17 erasure path: allowlisted app users only; removes company PII while preserving anonymous counters.';
COMMENT ON FUNCTION sales.log_touch(
  uuid,
  sales.touch_kanal,
  sales.touch_ergebnis,
  uuid,
  text,
  date,
  sales.abbruchgrund
) IS
  'Append a touchpoint using an unambiguous company UUID. Allowlisted app users only.';
