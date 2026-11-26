-- Status „Später“: jetzt nicht, aber vielleicht in Zukunft.
-- Bleibt ein aktiver Lead (relationship = Prospect) mit Wiedervorlage in der
-- Zukunft; ohne Datum standardmäßig in 3 Monaten statt übermorgen.

ALTER TYPE sales.pipeline_status ADD VALUE IF NOT EXISTS 'later' AFTER 'callback';

CREATE OR REPLACE FUNCTION sales.set_pipeline_status(
  p_company_id uuid,
  p_pipeline_status sales.pipeline_status,
  p_kanal sales.touch_kanal DEFAULT 'call'::sales.touch_kanal,
  p_naechster_touch date DEFAULT NULL::date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  selected_person_id uuid;
  selected_relationship sales.relationship;
  selected_result sales.touch_ergebnis;
  selected_next_touch date := coalesce(
    p_naechster_touch,
    CASE
      WHEN p_pipeline_status::text = 'later'
        THEN (sales.business_today() + interval '3 months')::date
      ELSE (sales.business_today() + 2)::date
    END
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

  status_label := CASE p_pipeline_status::text
    WHEN 'neu' THEN 'Neu'
    WHEN 'kein_anschluss_1' THEN 'Nicht erreicht (1)'
    WHEN 'kein_anschluss_2' THEN 'Nicht erreicht (2)'
    WHEN 'kein_anschluss_3' THEN 'Nicht erreicht (3)'
    WHEN 'kein_anschluss_4' THEN 'Nicht erreicht (4)'
    WHEN 'kein_anschluss_5' THEN 'Nicht erreicht (5)'
    WHEN 'callback' THEN 'Rückruf'
    WHEN 'later' THEN 'Später'
    WHEN 'disqualified' THEN 'Kein Interesse'
    WHEN 'set_appointment' THEN 'Termin gebucht'
    WHEN 'closed' THEN 'Closing'
    WHEN 'kunde' THEN 'Kunde'
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
$function$;
