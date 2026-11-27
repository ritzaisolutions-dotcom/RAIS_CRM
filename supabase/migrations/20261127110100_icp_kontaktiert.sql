-- ICP-Bewertung aus Notion als eigenes Feld + Automatik „Neu → Kontaktiert“.

-- 1) ICP (JA / Grenzfall / RAUS / offen) – filterbar wie crm_system.
ALTER TABLE sales.companies ADD COLUMN IF NOT EXISTS icp text NOT NULL DEFAULT 'offen';
ALTER TABLE sales.companies DROP CONSTRAINT IF EXISTS companies_icp_check;
ALTER TABLE sales.companies
  ADD CONSTRAINT companies_icp_check CHECK (icp IN ('JA', 'Grenzfall', 'RAUS', 'offen'));
-- notion_id wird vom Notion-Abgleich gesetzt (eindeutiger Index existiert bereits).
GRANT UPDATE (icp, notion_id) ON sales.companies TO authenticated;

-- 2) set_pipeline_status kennt „Kontaktiert“ (Label + Standard-Wiedervorlage in 7 Tagen).
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
    sales.next_weekday(CASE
      WHEN p_pipeline_status::text = 'later'
        THEN (sales.business_today() + interval '3 months')::date
      WHEN p_pipeline_status::text = 'kontaktiert'
        THEN (sales.business_today() + 7)::date
      ELSE (sales.business_today() + 2)::date
    END)
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
    WHEN 'kontaktiert' THEN 'Kontaktiert'
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

-- 3) Automatik: erste DM/E-Mail an einen „Neu“-Lead → „Kontaktiert“.
CREATE OR REPLACE FUNCTION sales.mark_contacted_on_outreach()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  IF NEW.voided_at IS NULL
     AND NEW.kanal IN ('dm'::sales.touch_kanal, 'email'::sales.touch_kanal) THEN
    UPDATE sales.companies
    SET pipeline_status = 'kontaktiert'::sales.pipeline_status
    WHERE id = NEW.company_id
      AND pipeline_status = 'neu'::sales.pipeline_status;
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION sales.mark_contacted_on_outreach() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS touchpoints_mark_contacted ON sales.touchpoints;
CREATE TRIGGER touchpoints_mark_contacted
  AFTER INSERT ON sales.touchpoints
  FOR EACH ROW EXECUTE FUNCTION sales.mark_contacted_on_outreach();

-- 4) v_leads um icp und notion_id erweitern (Spalten nur am Ende anhängen).
CREATE OR REPLACE VIEW sales.v_leads WITH (security_invoker = true) AS
 SELECT s.company_id,
    s.name AS firma,
    p.id AS person_id,
    p.name AS entscheider,
    s.stadt,
    s.crm_system AS crm,
    s.anfragen_pro_woche AS "anfragen/woche",
    s.naechster_touch,
    c.pipeline_status AS status,
    s.relationship,
    c.kategorie,
    s.tage_seit_touch,
    s.letzter_touch_at AS letzter_touch_am,
    s.letzter_kanal,
    lk.kanal AS letzter_kontakt_kanal,
    lk.occurred_at AS letzter_kontakt_am,
    pk.kanal AS vorheriger_kontakt_kanal,
    p.telefon AS tel,
    c.telefon AS firma_telefon,
    p.email,
    p.linkedin_url AS person_linkedin_url,
    s.company_linkedin_url AS linkedin_company_url,
    COALESCE(p.linkedin_url, s.company_linkedin_url) AS linkedin_url,
    s.inserate_aktiv,
    s.mitarbeiterzahl,
    s.meta_ads,
    c.website,
    c.instagram_url,
    c.facebook_url,
    c.xing_url,
    c.youtube_url,
    c.tiktok_url,
    c.quelle,
    c.quell_url,
    c.created_at,
    sales.contact_attempts(c.id) AS kontaktversuche,
    opp.stage AS opp_stage,
    c.icp,
    c.notion_id
   FROM sales.v_company_status s
     JOIN sales.companies c ON c.id = s.company_id
     LEFT JOIN LATERAL ( SELECT pe.id, pe.company_id, pe.name, pe.rolle, pe.email, pe.telefon,
            pe.linkedin_url, pe.ist_entscheider, pe.created_at, pe.notion_id
           FROM sales.people pe
          WHERE pe.company_id = s.company_id
          ORDER BY pe.ist_entscheider DESC, pe.created_at
         LIMIT 1) p ON true
     LEFT JOIN LATERAL ( SELECT t.kanal, t.occurred_at
           FROM sales.touchpoints t
          WHERE t.company_id = s.company_id AND t.voided_at IS NULL
            AND t.kanal = ANY (ARRAY['call'::sales.touch_kanal, 'email'::sales.touch_kanal, 'dm'::sales.touch_kanal, 'sms'::sales.touch_kanal, 'meeting'::sales.touch_kanal])
          ORDER BY t.occurred_at DESC
         LIMIT 1) lk ON true
     LEFT JOIN LATERAL ( SELECT t.kanal
           FROM sales.touchpoints t
          WHERE t.company_id = s.company_id AND t.voided_at IS NULL
            AND t.kanal = ANY (ARRAY['call'::sales.touch_kanal, 'email'::sales.touch_kanal, 'dm'::sales.touch_kanal, 'sms'::sales.touch_kanal, 'meeting'::sales.touch_kanal])
          ORDER BY t.occurred_at DESC
         OFFSET 1
         LIMIT 1) pk ON true
     LEFT JOIN LATERAL ( SELECT o.stage
           FROM sales.opportunities o
          WHERE o.company_id = s.company_id AND (o.stage = ANY (ARRAY['offen'::sales.opp_stage, 'angebot_raus'::sales.opp_stage]))
          ORDER BY o.created_at DESC
         LIMIT 1) opp ON true;
