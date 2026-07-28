-- Restrict direct Data API writes to the fields the application contract owns.
REVOKE INSERT, UPDATE ON sales.companies FROM authenticated;
REVOKE INSERT, UPDATE ON sales.people FROM authenticated;
REVOKE INSERT ON sales.touchpoints FROM authenticated;
REVOKE INSERT, UPDATE ON sales.opportunities FROM authenticated;

GRANT INSERT (
  name,
  stadt,
  telefon,
  website,
  instagram_url,
  facebook_url,
  crm_system,
  anfragen_pro_woche
) ON sales.companies TO authenticated;
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

GRANT INSERT (
  company_id,
  name,
  rolle,
  email,
  telefon,
  linkedin_url,
  ist_entscheider
) ON sales.people TO authenticated;
GRANT UPDATE (
  name,
  rolle,
  email,
  telefon,
  linkedin_url,
  ist_entscheider
) ON sales.people TO authenticated;

GRANT INSERT (
  company_id,
  person_id,
  kanal,
  ergebnis,
  abbruchgrund,
  notiz,
  naechster_touch
) ON sales.touchpoints TO authenticated;

GRANT INSERT (
  company_id,
  variante,
  setup_preis,
  retainer_monatlich,
  stage,
  close_grund,
  closed_at
) ON sales.opportunities TO authenticated;
GRANT UPDATE (
  variante,
  setup_preis,
  retainer_monatlich,
  stage,
  close_grund,
  closed_at
) ON sales.opportunities TO authenticated;

CREATE OR REPLACE FUNCTION sales.log_qualification_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.mitarbeiterzahl IS DISTINCT FROM OLD.mitarbeiterzahl THEN
    INSERT INTO sales.company_qualification_audit(
      company_id,
      field_name,
      old_value,
      new_value,
      changed_by
    )
    VALUES (
      NEW.id,
      'mitarbeiterzahl',
      OLD.mitarbeiterzahl::text,
      NEW.mitarbeiterzahl::text,
      auth.uid()
    );
  END IF;

  IF NEW.crm_system IS DISTINCT FROM OLD.crm_system THEN
    INSERT INTO sales.company_qualification_audit(
      company_id,
      field_name,
      old_value,
      new_value,
      changed_by
    )
    VALUES (
      NEW.id,
      'crm_system',
      OLD.crm_system::text,
      NEW.crm_system::text,
      auth.uid()
    );
  END IF;

  IF NEW.anfragen_pro_woche IS DISTINCT FROM OLD.anfragen_pro_woche THEN
    INSERT INTO sales.company_qualification_audit(
      company_id,
      field_name,
      old_value,
      new_value,
      changed_by
    )
    VALUES (
      NEW.id,
      'anfragen_pro_woche',
      OLD.anfragen_pro_woche::text,
      NEW.anfragen_pro_woche::text,
      auth.uid()
    );
  END IF;

  IF NEW.relationship IS DISTINCT FROM OLD.relationship THEN
    INSERT INTO sales.company_qualification_audit(
      company_id,
      field_name,
      old_value,
      new_value,
      changed_by
    )
    VALUES (
      NEW.id,
      'relationship',
      OLD.relationship::text,
      NEW.relationship::text,
      auth.uid()
    );
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION sales.log_qualification_change()
  FROM PUBLIC, anon, authenticated;
