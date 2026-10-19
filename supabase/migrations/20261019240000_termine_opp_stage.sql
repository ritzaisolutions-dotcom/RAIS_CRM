-- Termine sheet: surface open opportunity stage on list views.

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
  c.facebook_url,
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
) opp ON true
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
  c.facebook_url,
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
) opp ON true
WHERE s.relationship = 'Prospect'::sales.relationship
  AND c.pipeline_status = 'set_appointment'::sales.pipeline_status
ORDER BY
  s.naechster_touch NULLS LAST,
  s.name;

DROP VIEW IF EXISTS sales.v_kunden_liste;
CREATE VIEW sales.v_kunden_liste
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
  c.facebook_url,
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
) opp ON true
WHERE s.relationship = 'Kunde'::sales.relationship
ORDER BY s.name;

GRANT SELECT ON sales.v_call_liste TO authenticated;
GRANT SELECT ON sales.v_termine_liste TO authenticated;
GRANT SELECT ON sales.v_kunden_liste TO authenticated;
