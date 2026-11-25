-- Leads-Neuaufbau (Close-Stil): eine Leads-View, Quelle beschreibbar,
-- create_company mit Quelle, Massen-Import mit Dubletten-Abgleich,
-- einheitliche Status-Bezeichnungen in Touch-Notizen.

-- ---------------------------------------------------------------------------
-- 1) Einheitliche Leads-View über alle Beziehungen
-- ---------------------------------------------------------------------------
DROP VIEW IF EXISTS sales.v_leads_by_list;
DROP VIEW IF EXISTS sales.v_leads;
CREATE VIEW sales.v_leads
WITH (security_invoker = true) AS
SELECT
  s.company_id,
  s.name AS firma,
  p.id AS person_id,
  p.name AS entscheider,
  s.stadt,
  s.crm_system AS crm,
  s.anfragen_pro_woche AS "anfragen/woche",
  s.naechster_touch,
  c.pipeline_status AS status,
  s.relationship,
  s.tage_seit_touch,
  s.letzter_touch_at AS letzter_touch_am,
  s.letzter_kanal,
  p.telefon AS tel,
  c.telefon AS firma_telefon,
  p.email,
  p.linkedin_url AS person_linkedin_url,
  s.company_linkedin_url AS linkedin_company_url,
  coalesce(p.linkedin_url, s.company_linkedin_url) AS linkedin_url,
  s.inserate_aktiv,
  s.mitarbeiterzahl,
  s.meta_ads,
  c.website,
  c.instagram_url,
  c.facebook_url,
  c.quelle,
  c.quell_url,
  c.created_at,
  opp.stage AS opp_stage
FROM sales.v_company_status s
JOIN sales.companies c ON c.id = s.company_id
LEFT JOIN LATERAL (
  SELECT pe.*
  FROM sales.people pe
  WHERE pe.company_id = s.company_id
  ORDER BY pe.ist_entscheider DESC, pe.created_at
  LIMIT 1
) p ON true
LEFT JOIN LATERAL (
  SELECT o.stage
  FROM sales.opportunities o
  WHERE o.company_id = s.company_id
    AND o.stage IN ('offen'::sales.opp_stage, 'angebot_raus'::sales.opp_stage)
  ORDER BY o.created_at DESC
  LIMIT 1
) opp ON true;

CREATE VIEW sales.v_leads_by_list
WITH (security_invoker = true) AS
SELECT v.*, m.list_id
FROM sales.v_leads v
JOIN sales.lead_list_members m ON m.company_id = v.company_id;

GRANT SELECT ON sales.v_leads TO authenticated;
GRANT SELECT ON sales.v_leads_by_list TO authenticated;

-- ---------------------------------------------------------------------------
-- 2) Quelle im Client pflegbar
-- ---------------------------------------------------------------------------
GRANT UPDATE (quelle, quell_url) ON sales.companies TO authenticated;

-- ---------------------------------------------------------------------------
-- 3) create_company mit Quelle und Firmen-LinkedIn
--    (alte Signatur entfernen; neue Parameter alle mit Default → bestehende
--    Aufrufe mit benannten Parametern laufen weiter)
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS sales.create_company(
  text, text, text, text, text, text,
  sales.crm_system, integer, sales.pipeline_status,
  text, text, text, text
);

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
  p_person_linkedin_url text DEFAULT NULL,
  p_quelle sales.lead_quelle DEFAULT 'manuell'::sales.lead_quelle,
  p_quell_url text DEFAULT NULL,
  p_linkedin_url text DEFAULT NULL
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
    name, stadt, telefon, website, instagram_url, facebook_url,
    crm_system, anfragen_pro_woche, pipeline_status, relationship,
    quelle, quell_url, linkedin_url
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
    company_relationship,
    coalesce(p_quelle, 'manuell'::sales.lead_quelle),
    nullif(btrim(p_quell_url), ''),
    nullif(btrim(p_linkedin_url), '')
  )
  RETURNING id INTO company_id;

  IF normalized_person_name IS NOT NULL THEN
    INSERT INTO sales.people (
      company_id, name, email, telefon, linkedin_url, ist_entscheider
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

REVOKE ALL ON FUNCTION sales.create_company(
  text, text, text, text, text, text,
  sales.crm_system, integer, sales.pipeline_status,
  text, text, text, text,
  sales.lead_quelle, text, text
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION sales.create_company(
  text, text, text, text, text, text,
  sales.crm_system, integer, sales.pipeline_status,
  text, text, text, text,
  sales.lead_quelle, text, text
) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4) Quelle aus Freitext erkennen (Import, Notion-Migration)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION sales.parse_lead_quelle(p_text text)
RETURNS sales.lead_quelle
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE
    WHEN p_text IS NULL OR btrim(p_text) = '' THEN NULL
    WHEN lower(p_text) ~ '(is24|immoscout|immobilienscout)' THEN 'IS24'::sales.lead_quelle
    WHEN lower(p_text) ~ 'immowelt' THEN 'Immowelt'::sales.lead_quelle
    WHEN lower(p_text) ~ 'ivd' THEN 'IVD'::sales.lead_quelle
    WHEN lower(p_text) ~ 'linkedin' THEN 'LinkedIn'::sales.lead_quelle
    WHEN lower(p_text) ~ '(inbound|website|formular)' THEN 'Inbound Website'::sales.lead_quelle
    WHEN lower(p_text) ~ 'manuell' THEN 'manuell'::sales.lead_quelle
    ELSE NULL
  END
$$;

GRANT EXECUTE ON FUNCTION sales.parse_lead_quelle(text) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5) Massen-Import mit Dubletten-Abgleich, Ergebnis je Zeile
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION sales.import_leads(
  p_rows jsonb,
  p_skip_duplicates boolean DEFAULT true,
  p_list_id uuid DEFAULT NULL,
  p_default_quelle sales.lead_quelle DEFAULT 'manuell'::sales.lead_quelle
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  r jsonb;
  idx integer := -1;
  results jsonb := '[]'::jsonb;
  v_name text;
  v_stadt text;
  v_email text;
  v_person text;
  v_quelle sales.lead_quelle;
  v_notiz text;
  dup_id uuid;
  new_company uuid;
  new_person uuid;
BEGIN
  IF NOT sales.is_app_user() THEN
    RAISE EXCEPTION 'Nicht autorisiert' USING ERRCODE = '42501';
  END IF;

  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' THEN
    RAISE EXCEPTION 'Zeilen fehlen' USING ERRCODE = '22023';
  END IF;

  IF jsonb_array_length(p_rows) > 200 THEN
    RAISE EXCEPTION 'Maximal 200 Zeilen pro Aufruf' USING ERRCODE = '22023';
  END IF;

  IF p_list_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM sales.lead_lists l WHERE l.id = p_list_id) THEN
    RAISE EXCEPTION 'Liste nicht gefunden' USING ERRCODE = 'P0002';
  END IF;

  FOR r IN SELECT value FROM jsonb_array_elements(p_rows)
  LOOP
    idx := idx + 1;
    v_name := nullif(btrim(r->>'name'), '');
    v_stadt := nullif(btrim(r->>'stadt'), '');
    v_email := nullif(lower(btrim(r->>'email')), '');
    v_person := nullif(btrim(r->>'person_name'), '');
    v_notiz := nullif(btrim(r->>'notiz'), '');
    v_quelle := coalesce(sales.parse_lead_quelle(r->>'quelle'), p_default_quelle);
    dup_id := NULL;
    new_company := NULL;
    new_person := NULL;

    IF v_name IS NULL THEN
      results := results || jsonb_build_object(
        'index', idx, 'status', 'error', 'message', 'Firma fehlt');
      CONTINUE;
    END IF;

    IF v_email IS NOT NULL AND v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
      results := results || jsonb_build_object(
        'index', idx, 'status', 'error', 'message', 'Ungültige E-Mail');
      CONTINUE;
    END IF;

    -- Dubletten: E-Mail (global eindeutig) oder Name + Stadt
    IF v_email IS NOT NULL THEN
      SELECT pe.company_id INTO dup_id
      FROM sales.people pe
      WHERE lower(pe.email) = v_email
      LIMIT 1;
    END IF;
    IF dup_id IS NULL THEN
      SELECT c.id INTO dup_id
      FROM sales.companies c
      WHERE lower(c.name) = lower(v_name)
        AND lower(coalesce(c.stadt, '')) = lower(coalesce(v_stadt, ''))
      LIMIT 1;
    END IF;

    IF dup_id IS NOT NULL THEN
      IF p_list_id IS NOT NULL THEN
        INSERT INTO sales.lead_list_members (list_id, company_id)
        VALUES (p_list_id, dup_id)
        ON CONFLICT DO NOTHING;
      END IF;
      results := results || jsonb_build_object(
        'index', idx, 'status', 'duplicate', 'company_id', dup_id,
        'message', 'Existiert bereits');
      -- Bestehende Leads werden nie überschrieben; p_skip_duplicates=false
      -- markiert sie nur zusätzlich in der Ziel-Liste (oben).
      CONTINUE;
    END IF;

    BEGIN
      INSERT INTO sales.companies (
        name, stadt, telefon, website, instagram_url, facebook_url,
        linkedin_url, pipeline_status, relationship, quelle, quell_url
      )
      VALUES (
        v_name,
        v_stadt,
        nullif(btrim(r->>'telefon'), ''),
        nullif(btrim(r->>'website'), ''),
        nullif(btrim(r->>'instagram_url'), ''),
        nullif(btrim(r->>'facebook_url'), ''),
        nullif(btrim(r->>'linkedin_url'), ''),
        'neu'::sales.pipeline_status,
        'Prospect'::sales.relationship,
        v_quelle,
        nullif(btrim(r->>'quell_url'), '')
      )
      RETURNING id INTO new_company;

      IF v_person IS NOT NULL OR v_email IS NOT NULL THEN
        INSERT INTO sales.people (
          company_id, name, rolle, email, telefon, linkedin_url, ist_entscheider
        )
        VALUES (
          new_company,
          coalesce(v_person, v_name),
          nullif(btrim(r->>'rolle'), ''),
          v_email,
          nullif(btrim(r->>'person_telefon'), ''),
          nullif(btrim(r->>'person_linkedin_url'), ''),
          true
        )
        RETURNING id INTO new_person;
      END IF;

      IF v_notiz IS NOT NULL THEN
        PERFORM sales.log_touch(
          new_company,
          'note'::sales.touch_kanal,
          'kein_ergebnis'::sales.touch_ergebnis,
          new_person,
          v_notiz,
          NULL,
          NULL,
          NULL
        );
      END IF;

      IF p_list_id IS NOT NULL THEN
        INSERT INTO sales.lead_list_members (list_id, company_id)
        VALUES (p_list_id, new_company)
        ON CONFLICT DO NOTHING;
      END IF;

      results := results || jsonb_build_object(
        'index', idx, 'status', 'created', 'company_id', new_company);
    EXCEPTION
      WHEN unique_violation THEN
        results := results || jsonb_build_object(
          'index', idx, 'status', 'duplicate', 'message', 'Existiert bereits');
      WHEN OTHERS THEN
        results := results || jsonb_build_object(
          'index', idx, 'status', 'error', 'message', SQLERRM);
    END;
  END LOOP;

  RETURN results;
END;
$$;

REVOKE ALL ON FUNCTION sales.import_leads(jsonb, boolean, uuid, sales.lead_quelle)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION sales.import_leads(jsonb, boolean, uuid, sales.lead_quelle)
  TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 6) Status-Bezeichnungen in Touch-Notizen = UI-Bezeichnungen
--    (Logik unverändert gegenüber 20261019250000)
-- ---------------------------------------------------------------------------
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
  selected_next_touch date := coalesce(
    p_naechster_touch,
    (sales.business_today() + 2)::date
  );
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
      'closed'::sales.pipeline_status
    ) THEN 'termin_gebucht'::sales.touch_ergebnis
    ELSE 'kein_ergebnis'::sales.touch_ergebnis
  END;

  status_label := CASE p_pipeline_status
    WHEN 'neu'::sales.pipeline_status THEN 'Neu'
    WHEN 'kein_anschluss_1'::sales.pipeline_status THEN 'Nicht erreicht (1)'
    WHEN 'kein_anschluss_2'::sales.pipeline_status THEN 'Nicht erreicht (2)'
    WHEN 'kein_anschluss_3'::sales.pipeline_status THEN 'Nicht erreicht (3)'
    WHEN 'kein_anschluss_4'::sales.pipeline_status THEN 'Nicht erreicht (4)'
    WHEN 'kein_anschluss_5'::sales.pipeline_status THEN 'Nicht erreicht (5)'
    WHEN 'callback'::sales.pipeline_status THEN 'Rückruf'
    WHEN 'disqualified'::sales.pipeline_status THEN 'Kein Interesse'
    WHEN 'set_appointment'::sales.pipeline_status THEN 'Termin gebucht'
    WHEN 'closed'::sales.pipeline_status THEN 'Closing'
    WHEN 'kunde'::sales.pipeline_status THEN 'Kunde'
  END;

  INSERT INTO sales.touchpoints (
    company_id, person_id, kanal, ergebnis, notiz, naechster_touch, abbruchgrund
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
