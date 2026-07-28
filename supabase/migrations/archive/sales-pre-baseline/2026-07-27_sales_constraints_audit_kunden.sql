-- One Entscheider, unique email, qualification audit, Kunden list view.
-- Applied remotely as sales_constraints_audit_kunden_v2.

CREATE UNIQUE INDEX IF NOT EXISTS people_one_entscheider_per_company
  ON sales.people (company_id)
  WHERE ist_entscheider IS TRUE;

CREATE UNIQUE INDEX IF NOT EXISTS people_email_uniq
  ON sales.people (lower(email))
  WHERE email IS NOT NULL;

CREATE TABLE IF NOT EXISTS sales.company_qualification_audit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES sales.companies(id) ON DELETE RESTRICT,
  field_name text NOT NULL,
  old_value text,
  new_value text,
  changed_at timestamptz NOT NULL DEFAULT now(),
  changed_by uuid
);

CREATE INDEX IF NOT EXISTS company_qualification_audit_company_idx
  ON sales.company_qualification_audit (company_id, changed_at DESC);

ALTER TABLE sales.company_qualification_audit ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS authenticated_all ON sales.company_qualification_audit;
CREATE POLICY authenticated_all ON sales.company_qualification_audit
  FOR ALL TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

GRANT SELECT, INSERT ON sales.company_qualification_audit TO authenticated;
GRANT ALL ON sales.company_qualification_audit TO service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA sales TO authenticated, service_role;

CREATE OR REPLACE FUNCTION sales.log_qualification_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = sales, public
AS $$
BEGIN
  IF NEW.mitarbeiterzahl IS DISTINCT FROM OLD.mitarbeiterzahl THEN
    INSERT INTO sales.company_qualification_audit(company_id, field_name, old_value, new_value, changed_by)
    VALUES (NEW.id, 'mitarbeiterzahl', OLD.mitarbeiterzahl::text, NEW.mitarbeiterzahl::text, auth.uid());
  END IF;
  IF NEW.crm_system IS DISTINCT FROM OLD.crm_system THEN
    INSERT INTO sales.company_qualification_audit(company_id, field_name, old_value, new_value, changed_by)
    VALUES (NEW.id, 'crm_system', OLD.crm_system::text, NEW.crm_system::text, auth.uid());
  END IF;
  IF NEW.anfragen_pro_woche IS DISTINCT FROM OLD.anfragen_pro_woche THEN
    INSERT INTO sales.company_qualification_audit(company_id, field_name, old_value, new_value, changed_by)
    VALUES (NEW.id, 'anfragen_pro_woche', OLD.anfragen_pro_woche::text, NEW.anfragen_pro_woche::text, auth.uid());
  END IF;
  IF NEW.relationship IS DISTINCT FROM OLD.relationship THEN
    INSERT INTO sales.company_qualification_audit(company_id, field_name, old_value, new_value, changed_by)
    VALUES (NEW.id, 'relationship', OLD.relationship::text, NEW.relationship::text, auth.uid());
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_company_qualification_audit ON sales.companies;
CREATE TRIGGER trg_company_qualification_audit
  AFTER UPDATE ON sales.companies
  FOR EACH ROW
  EXECUTE FUNCTION sales.log_qualification_change();

CREATE OR REPLACE VIEW sales.v_kunden_liste
WITH (security_invoker = true)
AS
SELECT
  s.company_id,
  s.name AS firma,
  p.name AS entscheider,
  s.bundesland,
  s.crm_system AS crm,
  s.anfragen_pro_woche AS "anfragen/woche",
  s.naechster_touch,
  s.letztes_ergebnis AS status,
  s.tage_seit_touch,
  p.telefon AS tel,
  p.email,
  p.linkedin_url,
  s.inserate_aktiv
FROM sales.v_company_status s
LEFT JOIN LATERAL (
  SELECT pe.*
  FROM sales.people pe
  WHERE pe.company_id = s.company_id
  ORDER BY pe.ist_entscheider DESC, pe.created_at
  LIMIT 1
) p ON true
WHERE s.relationship = 'Kunde'::sales.relationship
ORDER BY s.name;

GRANT SELECT ON TABLE sales.v_kunden_liste TO authenticated;
GRANT SELECT ON TABLE sales.v_call_liste TO authenticated;
GRANT SELECT ON TABLE sales.v_company_status TO authenticated;
GRANT SELECT ON TABLE sales.v_akquise_daily TO authenticated;
GRANT SELECT ON TABLE sales.v_akquise_funnel TO authenticated;
GRANT SELECT ON TABLE sales.v_abbruchgruende TO authenticated;
GRANT SELECT ON TABLE sales.v_knowledge TO authenticated;

GRANT EXECUTE ON FUNCTION sales.log_touch(text, sales.touch_kanal, sales.touch_ergebnis, text, date, sales.abbruchgrund) TO authenticated;
GRANT EXECUTE ON FUNCTION sales.icp_rating(integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION sales.norm(text) TO authenticated;
