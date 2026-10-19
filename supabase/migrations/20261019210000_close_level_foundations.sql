-- Close-level foundations: log_touch source_key, app_settings, inbound quarantine.

-- ---------------------------------------------------------------------------
-- 1. log_touch: optional idempotent source_key
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION sales.log_touch(
  p_company_id uuid,
  p_kanal sales.touch_kanal,
  p_ergebnis sales.touch_ergebnis DEFAULT 'kein_ergebnis'::sales.touch_ergebnis,
  p_person_id uuid DEFAULT NULL,
  p_notiz text DEFAULT NULL,
  p_naechster date DEFAULT NULL,
  p_abbruch sales.abbruchgrund DEFAULT NULL,
  p_source_key text DEFAULT NULL
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = sales, public
AS $$
DECLARE
  selected_person_id uuid := p_person_id;
  touch_id bigint;
  v_key text := NULLIF(trim(p_source_key), '');
BEGIN
  IF NOT (auth.role() = 'service_role' OR sales.is_app_user()) THEN
    RAISE EXCEPTION 'Nicht autorisiert' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM sales.companies WHERE id = p_company_id) THEN
    RAISE EXCEPTION 'Firma nicht gefunden' USING ERRCODE = 'P0002';
  END IF;

  IF selected_person_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM sales.people
       WHERE id = selected_person_id AND company_id = p_company_id
     ) THEN
    RAISE EXCEPTION 'Kontakt gehört nicht zur Firma' USING ERRCODE = '23503';
  END IF;

  IF v_key IS NOT NULL THEN
    SELECT id INTO touch_id
    FROM sales.touchpoints
    WHERE source_key = v_key
    LIMIT 1;
    IF touch_id IS NOT NULL THEN
      RETURN touch_id;
    END IF;
  END IF;

  IF selected_person_id IS NULL THEN
    SELECT id INTO selected_person_id
    FROM sales.people
    WHERE company_id = p_company_id
    ORDER BY ist_entscheider DESC, created_at
    LIMIT 1;
  END IF;

  INSERT INTO sales.touchpoints (
    company_id, person_id, kanal, ergebnis, notiz,
    naechster_touch, abbruchgrund, source_key
  )
  VALUES (
    p_company_id,
    selected_person_id,
    p_kanal,
    p_ergebnis,
    p_notiz,
    p_naechster,
    p_abbruch,
    v_key
  )
  RETURNING id INTO touch_id;

  RETURN touch_id;
END;
$$;

REVOKE ALL ON FUNCTION sales.log_touch(
  uuid, sales.touch_kanal, sales.touch_ergebnis, uuid, text, date, sales.abbruchgrund, text
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION sales.log_touch(
  uuid, sales.touch_kanal, sales.touch_ergebnis, uuid, text, date, sales.abbruchgrund, text
) TO authenticated, service_role;

-- Drop prior 7-arg overload so all callers use the source_key signature.
DROP FUNCTION IF EXISTS sales.log_touch(
  uuid, sales.touch_kanal, sales.touch_ergebnis, uuid, text, date, sales.abbruchgrund
);

-- ---------------------------------------------------------------------------
-- 2. App settings (sync cursors, connection metadata — no secrets)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sales.app_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE sales.app_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS app_settings_all ON sales.app_settings;
CREATE POLICY app_settings_all ON sales.app_settings
  FOR ALL TO authenticated
  USING ((SELECT sales.is_app_user()))
  WITH CHECK ((SELECT sales.is_app_user()));

GRANT SELECT, INSERT, UPDATE, DELETE ON sales.app_settings TO authenticated;

-- ---------------------------------------------------------------------------
-- 3. Unmatched inbound quarantine
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sales.inbound_email_quarantine (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_ref text NOT NULL UNIQUE,
  from_email text,
  subject text,
  body text,
  received_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  resolved_company_id uuid REFERENCES sales.companies(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE sales.inbound_email_quarantine ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS inbound_quarantine_all ON sales.inbound_email_quarantine;
CREATE POLICY inbound_quarantine_all ON sales.inbound_email_quarantine
  FOR ALL TO authenticated
  USING ((SELECT sales.is_app_user()))
  WITH CHECK ((SELECT sales.is_app_user()));

GRANT SELECT, INSERT, UPDATE, DELETE ON sales.inbound_email_quarantine TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. Sequence enrollments: allow pause status if missing
-- ---------------------------------------------------------------------------
-- status already aktiv/pausiert/gestoppt/fertig from close_jobs migration
