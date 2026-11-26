-- Freitext-Kontext pro Ansprechpartner (Haltung, Alter, was ihm wichtig ist …).
-- Wird über sales.upsert_person_atomic gepflegt und von sales.gdpr_anonymize geleert.

ALTER TABLE sales.people
  ADD COLUMN IF NOT EXISTS kontext text;

ALTER TABLE sales.people
  DROP CONSTRAINT IF EXISTS people_kontext_len;
ALTER TABLE sales.people
  ADD CONSTRAINT people_kontext_len CHECK (kontext IS NULL OR char_length(kontext) <= 4000);

-- Alte Signatur (8 Parameter) ersetzen, damit es keine zweideutige Überladung gibt.
DROP FUNCTION IF EXISTS sales.upsert_person_atomic(uuid, uuid, text, text, text, text, text, boolean);

CREATE OR REPLACE FUNCTION sales.upsert_person_atomic(
  p_person_id uuid,
  p_company_id uuid,
  p_name text,
  p_rolle text DEFAULT NULL,
  p_email text DEFAULT NULL,
  p_telefon text DEFAULT NULL,
  p_linkedin_url text DEFAULT NULL,
  p_ist_entscheider boolean DEFAULT false,
  p_kontext text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
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
  IF NOT EXISTS (SELECT 1 FROM sales.companies WHERE id = p_company_id) THEN
    RAISE EXCEPTION 'Firma nicht gefunden' USING ERRCODE = 'P0002';
  END IF;
  IF p_person_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM sales.people WHERE id = p_person_id AND company_id = p_company_id
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
      company_id, name, rolle, email, telefon, linkedin_url, ist_entscheider, kontext
    )
    VALUES (
      p_company_id,
      normalized_name,
      nullif(btrim(p_rolle), ''),
      nullif(lower(btrim(p_email)), ''),
      nullif(btrim(p_telefon), ''),
      nullif(btrim(p_linkedin_url), ''),
      p_ist_entscheider,
      nullif(btrim(p_kontext), '')
    )
    RETURNING id INTO saved_person_id;
  ELSE
    UPDATE sales.people
    SET name = normalized_name,
        rolle = nullif(btrim(p_rolle), ''),
        email = nullif(lower(btrim(p_email)), ''),
        telefon = nullif(btrim(p_telefon), ''),
        linkedin_url = nullif(btrim(p_linkedin_url), ''),
        ist_entscheider = p_ist_entscheider,
        kontext = nullif(btrim(p_kontext), '')
    WHERE id = p_person_id AND company_id = p_company_id
    RETURNING id INTO saved_person_id;
  END IF;

  RETURN saved_person_id;
END;
$function$;

REVOKE ALL ON FUNCTION sales.upsert_person_atomic(uuid, uuid, text, text, text, text, text, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION sales.upsert_person_atomic(uuid, uuid, text, text, text, text, text, boolean, text) TO authenticated, service_role;

-- DSGVO: Kontext gehört zu den personenbezogenen Daten und wird mit anonymisiert.
CREATE OR REPLACE FUNCTION sales.gdpr_anonymize(p_company_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE short_id text := substr(replace(p_company_id::text, '-', ''), 1, 8);
BEGIN
  IF NOT sales.is_app_user() THEN RAISE EXCEPTION 'Nicht autorisiert' USING ERRCODE = '42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM sales.companies WHERE id = p_company_id) THEN
    RAISE EXCEPTION 'Firma nicht gefunden' USING ERRCODE = 'P0002';
  END IF;
  UPDATE sales.companies
  SET name = 'ANON-' || short_id, stadt = NULL, website = NULL, telefon = NULL, quell_url = NULL,
      notion_url = NULL, notion_id = NULL, recherche = NULL, facebook_url = NULL, instagram_url = NULL,
      relationship = 'Ausgeschlossen'::sales.relationship,
      pipeline_status = 'disqualified'::sales.pipeline_status, updated_at = now()
  WHERE id = p_company_id;
  UPDATE sales.people
  SET name = 'Anonym', email = NULL, telefon = NULL, linkedin_url = NULL, rolle = NULL,
      notion_id = NULL, kontext = NULL
  WHERE company_id = p_company_id;
  UPDATE sales.touchpoints SET notiz = NULL WHERE company_id = p_company_id;
  UPDATE sales.documents
  SET content_text = NULL, quelllink = NULL, titel = 'ANON-' || short_id, notion_id = NULL
  WHERE company_id = p_company_id;
  UPDATE sales.knowledge_evidence SET notiz = NULL, quelllink = NULL WHERE company_id = p_company_id;
  UPDATE sales.opportunities SET close_grund = NULL WHERE company_id = p_company_id;
END;
$function$;
