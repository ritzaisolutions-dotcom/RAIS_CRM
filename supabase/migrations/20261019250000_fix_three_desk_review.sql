-- Fix three-desk review: KPI attribution, Berlin dates, list filter views, atomic membership.

-- 1) set_pipeline_status: business_today fallback; kunde ≠ termin_gebucht
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
    WHEN p_pipeline_status = 'kunde'::sales.pipeline_status
      THEN 'kein_ergebnis'::sales.touch_ergebnis
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

-- 2) Membership-filtered list views (avoids huge PostgREST .in() lists)
DROP VIEW IF EXISTS sales.v_call_liste_by_list;
CREATE VIEW sales.v_call_liste_by_list
WITH (security_invoker = true) AS
SELECT v.*, m.list_id
FROM sales.v_call_liste v
JOIN sales.lead_list_members m ON m.company_id = v.company_id;

DROP VIEW IF EXISTS sales.v_termine_liste_by_list;
CREATE VIEW sales.v_termine_liste_by_list
WITH (security_invoker = true) AS
SELECT v.*, m.list_id
FROM sales.v_termine_liste v
JOIN sales.lead_list_members m ON m.company_id = v.company_id;

GRANT SELECT ON sales.v_call_liste_by_list TO authenticated;
GRANT SELECT ON sales.v_termine_liste_by_list TO authenticated;

-- 3) Atomic replace of a company's list memberships
CREATE OR REPLACE FUNCTION sales.set_company_list_membership(
  p_company_id uuid,
  p_list_ids uuid[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT sales.is_app_user() THEN
    RAISE EXCEPTION 'Nicht autorisiert' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM sales.companies c WHERE c.id = p_company_id
  ) THEN
    RAISE EXCEPTION 'Firma nicht gefunden' USING ERRCODE = 'P0002';
  END IF;

  DELETE FROM sales.lead_list_members
  WHERE company_id = p_company_id;

  IF p_list_ids IS NOT NULL AND cardinality(p_list_ids) > 0 THEN
    INSERT INTO sales.lead_list_members (list_id, company_id)
    SELECT DISTINCT unnest(p_list_ids), p_company_id;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION sales.set_company_list_membership(uuid, uuid[])
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION sales.set_company_list_membership(uuid, uuid[])
  TO authenticated, service_role;
