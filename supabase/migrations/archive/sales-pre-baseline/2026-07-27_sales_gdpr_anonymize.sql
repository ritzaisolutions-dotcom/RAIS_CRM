-- Art.17 exceptional anonymize path (NOT daily CRM use).
-- Applied remotely as sales_gdpr_anonymize.

CREATE OR REPLACE FUNCTION sales.gdpr_anonymize(p_company_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = sales, public
AS $$
DECLARE
  short_id text := substr(replace(p_company_id::text, '-', ''), 1, 8);
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Nicht authentifiziert';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM sales.companies WHERE id = p_company_id) THEN
    RAISE EXCEPTION 'Firma % nicht gefunden', p_company_id;
  END IF;

  UPDATE sales.companies
  SET
    name = 'ANON-' || short_id,
    telefon = NULL,
    website = NULL,
    quell_url = NULL,
    notion_url = NULL,
    notion_id = NULL,
    relationship = 'Ausgeschlossen',
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
END;
$$;

REVOKE ALL ON FUNCTION sales.gdpr_anonymize(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION sales.gdpr_anonymize(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION sales.gdpr_anonymize(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION sales.gdpr_anonymize(uuid) TO service_role;

COMMENT ON FUNCTION sales.gdpr_anonymize(uuid) IS
  'Art.17 erasure path: overwrite PII, set Ausgeschlossen, keep anonymous touchpoint counters. Not for daily CRM use.';
