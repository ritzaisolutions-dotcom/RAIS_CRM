-- One-shot backfill: public.crm_contacts (+ call events) → sales
-- Idempotent via companies.notion_id = legacy contact id / touchpoints.source_key

WITH src AS (
  SELECT
    c.*,
    CASE
      WHEN c.firma ILIKE '%Haller%' THEN 'Kunde'::sales.relationship
      WHEN c.status IN ('disqualified', 'dq') THEN 'Ausgeschlossen'::sales.relationship
      ELSE 'Prospect'::sales.relationship
    END AS rel
  FROM public.crm_contacts c
),
ins_companies AS (
  INSERT INTO sales.companies (
    id, name, stadt, website, telefon, relationship, quelle, quell_url, notion_id, created_at, updated_at
  )
  SELECT
    gen_random_uuid(),
    s.firma,
    NULLIF(s.stadt, ''),
    NULLIF(s.website, ''),
    NULLIF(s.telefon, ''),
    s.rel,
    'manuell'::sales.lead_quelle,
    NULLIF(s.website, ''),
    s.id,
    now(),
    now()
  FROM src s
  WHERE NOT EXISTS (
    SELECT 1 FROM sales.companies x WHERE x.notion_id = s.id
  )
  RETURNING id, notion_id
),
ins_people AS (
  INSERT INTO sales.people (
    company_id, name, rolle, email, telefon, ist_entscheider, notion_id
  )
  SELECT
    ic.id,
    COALESCE(NULLIF(s.kontakt, ''), NULLIF(s.title, ''), 'Unbekannt'),
    NULLIF(s.title, ''),
    NULLIF(lower(s.email), ''),
    NULLIF(s.telefon, ''),
    true,
    s.id
  FROM ins_companies ic
  JOIN src s ON s.id = ic.notion_id
  RETURNING id
)
SELECT 1;

-- Touch history (run after companies exist)
WITH mapped AS (
  SELECT
    co.id AS company_id,
    pe.id AS person_id,
    CASE
      WHEN e.event_type = 'status_changed' THEN 'status_change'::sales.touch_kanal
      ELSE 'call'::sales.touch_kanal
    END AS kanal,
    CASE e.result_bucket
      WHEN 'no_answer' THEN 'nicht_erreicht'::sales.touch_ergebnis
      WHEN 'conversation' THEN 'gespraech_ohne_termin'::sales.touch_ergebnis
      WHEN 'negative' THEN 'disqualifiziert'::sales.touch_ergebnis
      ELSE 'kein_ergebnis'::sales.touch_ergebnis
    END AS ergebnis,
    COALESCE(e.touch_label, e.event_type) AS notiz,
    COALESCE(e.occurred_at, e.created_at, now()) AS occurred_at,
    'legacy:' || e.id::text AS source_key
  FROM public.crm_call_events e
  JOIN sales.companies co ON co.notion_id = e.contact_id
  LEFT JOIN sales.people pe ON pe.company_id = co.id AND pe.ist_entscheider
)
INSERT INTO sales.touchpoints (
  company_id, person_id, kanal, ergebnis, notiz, occurred_at, source_key
)
SELECT company_id, person_id, kanal, ergebnis, notiz, occurred_at, source_key
FROM mapped m
WHERE NOT EXISTS (
  SELECT 1 FROM sales.touchpoints t WHERE t.source_key = m.source_key
);
