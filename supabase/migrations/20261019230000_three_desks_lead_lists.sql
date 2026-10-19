-- Three desks: Dialen excludes set_appointment; Termine view; membership lists.

CREATE TABLE IF NOT EXISTS sales.lead_lists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users (id)
);

CREATE UNIQUE INDEX IF NOT EXISTS lead_lists_name_ci
  ON sales.lead_lists (lower(trim(name)));

CREATE TABLE IF NOT EXISTS sales.lead_list_members (
  list_id uuid NOT NULL REFERENCES sales.lead_lists (id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES sales.companies (id) ON DELETE CASCADE,
  added_at timestamptz NOT NULL DEFAULT now(),
  added_by uuid REFERENCES auth.users (id),
  PRIMARY KEY (list_id, company_id)
);

CREATE INDEX IF NOT EXISTS lead_list_members_company_idx
  ON sales.lead_list_members (company_id);

ALTER TABLE sales.lead_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales.lead_list_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lead_lists_all ON sales.lead_lists;
CREATE POLICY lead_lists_all ON sales.lead_lists
  FOR ALL TO authenticated
  USING ((SELECT sales.is_app_user()))
  WITH CHECK ((SELECT sales.is_app_user()));

DROP POLICY IF EXISTS lead_list_members_all ON sales.lead_list_members;
CREATE POLICY lead_list_members_all ON sales.lead_list_members
  FOR ALL TO authenticated
  USING ((SELECT sales.is_app_user()))
  WITH CHECK ((SELECT sales.is_app_user()));

GRANT SELECT, INSERT, UPDATE, DELETE ON sales.lead_lists TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON sales.lead_list_members TO authenticated;

-- Dialen: Prospects minus Termin-gebucht
DROP VIEW IF EXISTS sales.v_call_liste;
CREATE VIEW sales.v_call_liste
WITH (security_invoker = true) AS
SELECT
  s.company_id,
  s.name AS firma,
  p.name AS entscheider,
  s.bundesland,
  s.stadt,
  s.crm_system AS crm,
  s.anfragen_pro_woche AS "anfragen/woche",
  s.naechster_touch,
  c.pipeline_status AS status,
  s.tage_seit_touch,
  p.telefon AS tel,
  p.email,
  coalesce(p.linkedin_url, s.company_linkedin_url) AS linkedin_url,
  s.inserate_aktiv,
  s.mitarbeiterzahl,
  s.meta_ads,
  c.website,
  c.instagram_url,
  c.facebook_url
FROM sales.v_company_status s
JOIN sales.companies c ON c.id = s.company_id
LEFT JOIN LATERAL (
  SELECT pe.*
  FROM sales.people pe
  WHERE pe.company_id = s.company_id
  ORDER BY pe.ist_entscheider DESC, pe.created_at
  LIMIT 1
) p ON true
WHERE s.relationship = 'Prospect'::sales.relationship
  AND c.pipeline_status IS DISTINCT FROM 'set_appointment'::sales.pipeline_status
ORDER BY
  (
    s.naechster_touch IS NOT NULL
    AND s.naechster_touch <= sales.business_today()
  ) DESC,
  s.naechster_touch,
  s.anfragen_pro_woche DESC NULLS LAST,
  s.inserate_aktiv DESC NULLS LAST;

-- Termine: Prospect + Termin gebucht
DROP VIEW IF EXISTS sales.v_termine_liste;
CREATE VIEW sales.v_termine_liste
WITH (security_invoker = true) AS
SELECT
  s.company_id,
  s.name AS firma,
  p.name AS entscheider,
  s.bundesland,
  s.stadt,
  s.crm_system AS crm,
  s.anfragen_pro_woche AS "anfragen/woche",
  s.naechster_touch,
  c.pipeline_status AS status,
  s.tage_seit_touch,
  p.telefon AS tel,
  p.email,
  coalesce(p.linkedin_url, s.company_linkedin_url) AS linkedin_url,
  s.inserate_aktiv,
  s.mitarbeiterzahl,
  s.meta_ads,
  c.website,
  c.instagram_url,
  c.facebook_url
FROM sales.v_company_status s
JOIN sales.companies c ON c.id = s.company_id
LEFT JOIN LATERAL (
  SELECT pe.*
  FROM sales.people pe
  WHERE pe.company_id = s.company_id
  ORDER BY pe.ist_entscheider DESC, pe.created_at
  LIMIT 1
) p ON true
WHERE s.relationship = 'Prospect'::sales.relationship
  AND c.pipeline_status = 'set_appointment'::sales.pipeline_status
ORDER BY
  s.naechster_touch NULLS LAST,
  s.name;

GRANT SELECT ON sales.v_call_liste TO authenticated;
GRANT SELECT ON sales.v_termine_liste TO authenticated;

-- Note: apply remote version must use c.instagram_url / c.facebook_url (not n.).
