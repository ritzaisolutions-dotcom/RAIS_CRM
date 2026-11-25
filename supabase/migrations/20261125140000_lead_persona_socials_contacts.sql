-- Lead-Zusammenfassung: Persona-Kontext, weitere Social-Links, Kontaktzähler.

ALTER TABLE sales.companies
  ADD COLUMN IF NOT EXISTS persona text,
  ADD COLUMN IF NOT EXISTS xing_url text,
  ADD COLUMN IF NOT EXISTS youtube_url text,
  ADD COLUMN IF NOT EXISTS tiktok_url text;

ALTER TABLE sales.companies
  DROP CONSTRAINT IF EXISTS companies_persona_len;
ALTER TABLE sales.companies
  ADD CONSTRAINT companies_persona_len CHECK (persona IS NULL OR length(persona) <= 8000);

GRANT UPDATE (persona, xing_url, youtube_url, tiktok_url) ON sales.companies TO authenticated;

-- Kontaktversuche = echte Kontakte (Anruf, E-Mail, DM, SMS, Meeting), ohne
-- Notizen, Aufgaben und reine Statuswechsel; stornierte zählen nicht.
CREATE OR REPLACE FUNCTION sales.contact_attempts(p_company_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT count(*)::integer
  FROM sales.touchpoints t
  WHERE t.company_id = p_company_id
    AND t.voided_at IS NULL
    AND t.kanal IN (
      'call'::sales.touch_kanal,
      'email'::sales.touch_kanal,
      'dm'::sales.touch_kanal,
      'sms'::sales.touch_kanal,
      'meeting'::sales.touch_kanal
    );
$$;

GRANT EXECUTE ON FUNCTION sales.contact_attempts(uuid) TO authenticated, service_role;

DROP VIEW IF EXISTS sales.v_leads_by_list;
DROP VIEW IF EXISTS sales.v_leads;
CREATE VIEW sales.v_leads
WITH (security_invoker = true) AS
SELECT
  s.company_id,
  s.name AS firma,
  p.id AS person_id,
  p.name AS entscheider,
  s.stadt,
  s.crm_system AS crm,
  s.anfragen_pro_woche AS "anfragen/woche",
  s.naechster_touch,
  c.pipeline_status AS status,
  s.relationship,
  s.tage_seit_touch,
  s.letzter_touch_at AS letzter_touch_am,
  s.letzter_kanal,
  p.telefon AS tel,
  c.telefon AS firma_telefon,
  p.email,
  p.linkedin_url AS person_linkedin_url,
  s.company_linkedin_url AS linkedin_company_url,
  coalesce(p.linkedin_url, s.company_linkedin_url) AS linkedin_url,
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
) opp ON true;

CREATE VIEW sales.v_leads_by_list
WITH (security_invoker = true) AS
SELECT v.*, m.list_id
FROM sales.v_leads v
JOIN sales.lead_list_members m ON m.company_id = v.company_id;

GRANT SELECT ON sales.v_leads TO authenticated;
GRANT SELECT ON sales.v_leads_by_list TO authenticated;
