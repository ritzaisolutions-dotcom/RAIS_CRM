-- Sales schema baseline (cutover 2026-07-27)
-- Remote chain: create_sales_schema … sales_analytics_dashboard
-- Fresh installs: baseline → harden_sales_security_integrity → tighten_sales_column_privileges
-- Production qdywaenmojdxhfxqbvun: already applied via remote history.

CREATE SCHEMA IF NOT EXISTS sales;

DO $$ BEGIN CREATE TYPE sales.abbruchgrund AS ENUM ('zu_klein', 'kein_schmerz', 'kein_budget', 'kein_interesse', 'timing'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE sales.crm_system AS ENUM ('onOffice', 'Propstack', 'FlowFact', 'FIO Webmakler', 'kein CRM', 'unbekannt'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE sales.doc_typ AS ENUM ('transkript', 'angebot', 'sop', 'sonstiges'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE sales.knowledge_quelle AS ENUM ('Discovery Call', 'Demo', 'Check-in', 'LinkedIn DM', 'Build/Debug', 'Kundenfeedback', 'Recherche'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE sales.knowledge_status AS ENUM ('Hypothese', 'Bestaetigt', 'Widerlegt', 'Veraltet'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE sales.knowledge_typ AS ENUM ('Sales', 'Technisch', 'Prozess', 'Positionierung', 'Produkt', 'Recht/DSGVO'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE sales.lead_quelle AS ENUM ('IS24', 'Immowelt', 'IVD', 'LinkedIn', 'manuell', 'Inbound Website'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE sales.mitarbeiter_klasse AS ENUM ('1-2', '3-5', '5-25', '25+', 'unbekannt'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE sales.opp_stage AS ENUM ('offen', 'angebot_raus', 'gewonnen', 'verloren'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE sales.opp_variante AS ENUM ('system_3k', 'system_crm_6k'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE sales.pipeline_status AS ENUM ('neu', 'kein_anschluss_1', 'kein_anschluss_2', 'kein_anschluss_3', 'kein_anschluss_4', 'kein_anschluss_5', 'callback', 'disqualified', 'set_appointment', 'closed', 'kunde'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE sales.rechtsform AS ENUM ('GmbH', 'GmbH & Co. KG', 'UG', 'Einzelunternehmen', 'unbekannt'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE sales.region_cluster AS ENUM ('RLP', 'Rhein-Main', 'NRW', 'Sonstige'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE sales.relationship AS ENUM ('Prospect', 'Kunde', 'Ausgeschlossen'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE sales.touch_ergebnis AS ENUM ('nicht_erreicht', 'erreicht_ohne_gespraech', 'disqualifiziert', 'gespraech_ohne_termin', 'termin_gebucht', 'kein_ergebnis'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE sales.touch_kanal AS ENUM ('call', 'dm', 'email', 'meeting', 'engagement', 'status_change'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Tables
CREATE TABLE IF NOT EXISTS sales.app_users (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text,
  notiz text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sales.companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  stadt text,
  bundesland text,
  region sales.region_cluster,
  website text,
  telefon text,
  rechtsform sales.rechtsform DEFAULT 'unbekannt'::sales.rechtsform,
  mitarbeiterzahl sales.mitarbeiter_klasse DEFAULT 'unbekannt'::sales.mitarbeiter_klasse,
  crm_system sales.crm_system DEFAULT 'unbekannt'::sales.crm_system,
  anfragen_pro_woche integer CHECK (anfragen_pro_woche >= 0),
  inserate_aktiv integer CHECK (inserate_aktiv >= 0),
  quelle sales.lead_quelle,
  quell_url text,
  relationship sales.relationship NOT NULL DEFAULT 'Prospect'::sales.relationship,
  notion_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  notion_id text,
  recherche text,
  facebook_url text,
  instagram_url text,
  pipeline_status sales.pipeline_status NOT NULL DEFAULT 'neu'::sales.pipeline_status
);

CREATE TABLE IF NOT EXISTS sales.people (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES sales.companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  rolle text,
  email text,
  telefon text,
  linkedin_url text,
  ist_entscheider boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  notion_id text
);

CREATE TABLE IF NOT EXISTS sales.touchpoints (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES sales.companies(id) ON DELETE RESTRICT,
  person_id uuid REFERENCES sales.people(id) ON DELETE SET NULL,
  kanal sales.touch_kanal NOT NULL,
  ergebnis sales.touch_ergebnis NOT NULL DEFAULT 'kein_ergebnis'::sales.touch_ergebnis,
  abbruchgrund sales.abbruchgrund,
  notiz text,
  naechster_touch date,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  source_key text,
  CONSTRAINT abbruchgrund_nur_bei_gespraech CHECK (
    abbruchgrund IS NULL
    OR ergebnis = ANY (
      ARRAY[
        'gespraech_ohne_termin'::sales.touch_ergebnis,
        'disqualifiziert'::sales.touch_ergebnis
      ]
    )
  )
);

CREATE TABLE IF NOT EXISTS sales.opportunities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES sales.companies(id) ON DELETE CASCADE,
  variante sales.opp_variante NOT NULL,
  setup_preis numeric(10,2),
  retainer_monatlich numeric(10,2),
  stage sales.opp_stage NOT NULL DEFAULT 'offen'::sales.opp_stage,
  close_grund text,
  created_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  CONSTRAINT closed_braucht_datum CHECK (
    (stage = ANY (ARRAY['gewonnen'::sales.opp_stage, 'verloren'::sales.opp_stage]))
    = (closed_at IS NOT NULL)
  )
);

CREATE TABLE IF NOT EXISTS sales.company_qualification_audit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES sales.companies(id) ON DELETE RESTRICT,
  field_name text NOT NULL,
  old_value text,
  new_value text,
  changed_at timestamptz NOT NULL DEFAULT now(),
  changed_by uuid
);

CREATE TABLE IF NOT EXISTS sales.documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES sales.companies(id) ON DELETE SET NULL,
  typ sales.doc_typ NOT NULL,
  titel text NOT NULL,
  content_text text,
  quelllink text,
  datum date,
  created_at timestamptz NOT NULL DEFAULT now(),
  notion_id text
);

CREATE TABLE IF NOT EXISTS sales.knowledge (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  learning text NOT NULL,
  body text,
  typ sales.knowledge_typ NOT NULL,
  status sales.knowledge_status NOT NULL DEFAULT 'Hypothese'::sales.knowledge_status,
  software_stack text[],
  supersedes uuid REFERENCES sales.knowledge(id) ON DELETE SET NULL,
  valid_from date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamptz NOT NULL DEFAULT now(),
  notion_id text
);

CREATE TABLE IF NOT EXISTS sales.knowledge_evidence (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  knowledge_id uuid NOT NULL REFERENCES sales.knowledge(id) ON DELETE CASCADE,
  company_id uuid REFERENCES sales.companies(id) ON DELETE SET NULL,
  quelle sales.knowledge_quelle NOT NULL,
  quelllink text,
  beobachtet_am date NOT NULL DEFAULT CURRENT_DATE,
  notiz text
);

CREATE TABLE IF NOT EXISTS sales.legacy_contacts (
  notion_id text PRIMARY KEY,
  firma text,
  stadt text,
  icp_rating text,
  status text,
  grund text,
  rohdaten jsonb,
  archiviert_am timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sales.ref_stadt_bundesland (
  stadt text PRIMARY KEY,
  bundesland text NOT NULL,
  region sales.region_cluster
);

CREATE TABLE IF NOT EXISTS sales.territories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stadt text NOT NULL,
  bundesland text,
  region sales.region_cluster,
  quelle sales.lead_quelle,
  gescrapt_am date,
  treffer integer,
  notiz text
);

CREATE TABLE IF NOT EXISTS sales.work_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  typ text NOT NULL DEFAULT 'akquise',
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  notiz text
);

-- Indexes
CREATE UNIQUE INDEX IF NOT EXISTS companies_name_stadt_uniq
  ON sales.companies (lower(name), lower(COALESCE(stadt, '')));
CREATE UNIQUE INDEX IF NOT EXISTS companies_notion_uniq
  ON sales.companies (notion_id) WHERE notion_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS companies_domain_idx ON sales.companies (lower(website));
CREATE INDEX IF NOT EXISTS people_company_idx ON sales.people (company_id);
CREATE UNIQUE INDEX IF NOT EXISTS people_one_entscheider_per_company
  ON sales.people (company_id) WHERE ist_entscheider IS TRUE;
CREATE UNIQUE INDEX IF NOT EXISTS people_email_uniq
  ON sales.people (lower(email)) WHERE email IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS people_linkedin_uniq
  ON sales.people (lower(linkedin_url)) WHERE linkedin_url IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS people_notion_uniq
  ON sales.people (notion_id) WHERE notion_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS touchpoints_company_idx
  ON sales.touchpoints (company_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS touchpoints_naechster_idx
  ON sales.touchpoints (naechster_touch) WHERE naechster_touch IS NOT NULL;
CREATE INDEX IF NOT EXISTS touchpoints_occurred_idx
  ON sales.touchpoints (occurred_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS touchpoints_source_uniq
  ON sales.touchpoints (source_key) WHERE source_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS company_qualification_audit_company_idx
  ON sales.company_qualification_audit (company_id, changed_at DESC);
CREATE INDEX IF NOT EXISTS documents_company_idx ON sales.documents (company_id);
CREATE INDEX IF NOT EXISTS documents_fts_idx ON sales.documents USING gin (
  to_tsvector('german', COALESCE(titel, '') || ' ' || COALESCE(content_text, ''))
);
CREATE UNIQUE INDEX IF NOT EXISTS documents_notion_uniq
  ON sales.documents (notion_id) WHERE notion_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS knowledge_notion_uniq
  ON sales.knowledge (notion_id) WHERE notion_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS knowledge_evidence_kid_idx
  ON sales.knowledge_evidence (knowledge_id);
CREATE INDEX IF NOT EXISTS opportunities_company_idx ON sales.opportunities (company_id);
CREATE UNIQUE INDEX IF NOT EXISTS territories_stadt_quelle_uniq
  ON sales.territories (lower(stadt), quelle);

-- Helper functions
CREATE OR REPLACE FUNCTION sales.norm(t text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT lower(translate(coalesce(t, ''), 'äöüÄÖÜß', 'aouAOUs'));
$$;

CREATE OR REPLACE FUNCTION sales.clean_stadt(t text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT nullif(btrim(split_part(split_part(coalesce(t, ''), '+', 1), '(', 1)), '');
$$;

CREATE OR REPLACE FUNCTION sales.primary_person(t text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT nullif(btrim(split_part(split_part(coalesce(t, ''), '(', 1), ',', 1)), '');
$$;

CREATE OR REPLACE FUNCTION sales.icp_rating(p_anfragen integer, p_inserate integer)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT CASE
    WHEN p_anfragen IS NOT NULL AND p_anfragen >= 25 THEN 'A'
    WHEN p_anfragen IS NOT NULL AND p_anfragen >= 15 THEN 'B'
    WHEN p_anfragen IS NOT NULL THEN 'Raus'
    WHEN p_inserate IS NOT NULL AND p_inserate >= 25 THEN 'A'
    WHEN p_inserate IS NOT NULL AND p_inserate >= 10 THEN 'B'
    WHEN p_inserate IS NOT NULL THEN 'C'
    ELSE 'unbewertet'
  END;
$$;

CREATE OR REPLACE FUNCTION sales.touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION sales.fill_geo()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE r record;
BEGIN
  IF NEW.stadt IS NOT NULL AND (NEW.bundesland IS NULL OR NEW.region IS NULL) THEN
    SELECT * INTO r FROM sales.ref_stadt_bundesland
    WHERE stadt = sales.norm(NEW.stadt)
    LIMIT 1;
    IF FOUND THEN
      NEW.bundesland := coalesce(NEW.bundesland, r.bundesland);
      NEW.region := coalesce(NEW.region, r.region);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION sales.deny_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  RAISE EXCEPTION 'sales.touchpoints ist append-only. % ist nicht erlaubt.', TG_OP
    USING ERRCODE = '42501';
END;
$$;

CREATE OR REPLACE FUNCTION sales.log_qualification_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
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

CREATE OR REPLACE FUNCTION sales.is_app_user()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT auth.uid() IS NOT NULL
    AND EXISTS (SELECT 1 FROM sales.app_users WHERE user_id = auth.uid());
$$;

-- Views (security_invoker)
CREATE OR REPLACE VIEW sales.v_company_status
WITH (security_invoker = true) AS
SELECT
  c.id AS company_id,
  c.name,
  c.stadt,
  c.bundesland,
  c.region,
  c.crm_system,
  c.anfragen_pro_woche,
  c.inserate_aktiv,
  c.relationship,
  c.website,
  c.facebook_url,
  c.instagram_url,
  c.recherche,
  t.ergebnis AS letztes_ergebnis,
  t.kanal AS letzter_kanal,
  t.occurred_at AS letzter_touch_at,
  CURRENT_DATE - t.occurred_at::date AS tage_seit_touch,
  n.naechster_touch,
  (SELECT count(*) FROM sales.touchpoints x WHERE x.company_id = c.id) AS touches_gesamt
FROM sales.companies c
LEFT JOIN LATERAL (
  SELECT t2.* FROM sales.touchpoints t2
  WHERE t2.company_id = c.id
  ORDER BY t2.occurred_at DESC
  LIMIT 1
) t ON true
LEFT JOIN LATERAL (
  SELECT t3.naechster_touch FROM sales.touchpoints t3
  WHERE t3.company_id = c.id AND t3.naechster_touch IS NOT NULL
  ORDER BY t3.occurred_at DESC
  LIMIT 1
) n ON true;

CREATE OR REPLACE VIEW sales.v_call_liste
WITH (security_invoker = true) AS
SELECT
  s.company_id,
  s.name AS firma,
  p.name AS entscheider,
  s.bundesland,
  s.crm_system AS crm,
  s.anfragen_pro_woche AS "anfragen/woche",
  s.naechster_touch,
  c.pipeline_status AS status,
  s.tage_seit_touch,
  p.telefon AS tel,
  p.email,
  p.linkedin_url,
  s.inserate_aktiv,
  c.website,
  c.instagram_url,
  c.facebook_url
FROM sales.v_company_status s
JOIN sales.companies c ON c.id = s.company_id
LEFT JOIN LATERAL (
  SELECT pe.* FROM sales.people pe
  WHERE pe.company_id = s.company_id
  ORDER BY pe.ist_entscheider DESC, pe.created_at
  LIMIT 1
) p ON true
WHERE s.relationship = 'Prospect'::sales.relationship
ORDER BY
  (s.naechster_touch IS NOT NULL AND s.naechster_touch <= CURRENT_DATE) DESC,
  s.naechster_touch,
  s.anfragen_pro_woche DESC NULLS LAST,
  s.inserate_aktiv DESC NULLS LAST;

CREATE OR REPLACE VIEW sales.v_kunden_liste
WITH (security_invoker = true) AS
SELECT
  s.company_id,
  s.name AS firma,
  p.name AS entscheider,
  s.bundesland,
  s.crm_system AS crm,
  s.anfragen_pro_woche AS "anfragen/woche",
  s.naechster_touch,
  c.pipeline_status AS status,
  s.tage_seit_touch,
  p.telefon AS tel,
  p.email,
  p.linkedin_url,
  s.inserate_aktiv,
  c.website,
  c.instagram_url,
  c.facebook_url
FROM sales.v_company_status s
JOIN sales.companies c ON c.id = s.company_id
LEFT JOIN LATERAL (
  SELECT pe.* FROM sales.people pe
  WHERE pe.company_id = s.company_id
  ORDER BY pe.ist_entscheider DESC, pe.created_at
  LIMIT 1
) p ON true
WHERE s.relationship = 'Kunde'::sales.relationship
ORDER BY s.name;

CREATE OR REPLACE VIEW sales.v_akquise_daily
WITH (security_invoker = true) AS
SELECT
  occurred_at::date AS tag,
  count(*) FILTER (WHERE kanal = 'call'::sales.touch_kanal) AS dials,
  count(DISTINCT company_id) FILTER (WHERE kanal = 'call'::sales.touch_kanal) AS firmen,
  count(*) FILTER (WHERE kanal = 'call'::sales.touch_kanal AND ergebnis <> 'nicht_erreicht'::sales.touch_ergebnis) AS erreicht,
  count(*) FILTER (WHERE ergebnis = ANY (ARRAY['gespraech_ohne_termin'::sales.touch_ergebnis, 'disqualifiziert'::sales.touch_ergebnis, 'termin_gebucht'::sales.touch_ergebnis])) AS gespraeche,
  count(*) FILTER (WHERE ergebnis = 'termin_gebucht'::sales.touch_ergebnis) AS termine,
  count(*) FILTER (WHERE kanal = 'dm'::sales.touch_kanal) AS dms
FROM sales.touchpoints
WHERE kanal <> 'status_change'::sales.touch_kanal
GROUP BY occurred_at::date
ORDER BY occurred_at::date DESC;

CREATE OR REPLACE VIEW sales.v_akquise_funnel
WITH (security_invoker = true) AS
WITH base AS (
  SELECT * FROM sales.touchpoints
  WHERE kanal = 'call'::sales.touch_kanal
    AND occurred_at >= now() - interval '90 days'
)
SELECT
  count(*) AS dials,
  count(*) FILTER (WHERE ergebnis <> 'nicht_erreicht'::sales.touch_ergebnis) AS erreicht,
  count(*) FILTER (WHERE ergebnis = ANY (ARRAY['gespraech_ohne_termin'::sales.touch_ergebnis, 'disqualifiziert'::sales.touch_ergebnis, 'termin_gebucht'::sales.touch_ergebnis])) AS gespraeche,
  count(*) FILTER (WHERE ergebnis = 'termin_gebucht'::sales.touch_ergebnis) AS termine,
  round(100.0 * count(*) FILTER (WHERE ergebnis <> 'nicht_erreicht'::sales.touch_ergebnis)::numeric / NULLIF(count(*), 0)::numeric, 1) AS connect_rate_pct,
  round(100.0 * count(*) FILTER (WHERE ergebnis = 'termin_gebucht'::sales.touch_ergebnis)::numeric / NULLIF(count(*) FILTER (WHERE ergebnis = ANY (ARRAY['gespraech_ohne_termin'::sales.touch_ergebnis, 'disqualifiziert'::sales.touch_ergebnis, 'termin_gebucht'::sales.touch_ergebnis])), 0)::numeric, 1) AS terminquote_pct,
  round(count(*)::numeric / NULLIF(count(*) FILTER (WHERE ergebnis = 'termin_gebucht'::sales.touch_ergebnis), 0)::numeric, 1) AS dials_pro_termin,
  CASE WHEN count(*) < 100 THEN 'zu kleine Stichprobe, nur Aktivitaet bewerten' ELSE 'belastbar' END AS hinweis
FROM base;

CREATE OR REPLACE VIEW sales.v_abbruchgruende
WITH (security_invoker = true) AS
SELECT
  abbruchgrund,
  count(*) AS anzahl,
  round(100.0 * count(*)::numeric / sum(count(*)) OVER (), 1) AS anteil_pct
FROM sales.touchpoints
WHERE abbruchgrund IS NOT NULL
  AND occurred_at >= now() - interval '90 days'
GROUP BY abbruchgrund
ORDER BY count(*) DESC;

CREATE OR REPLACE VIEW sales.v_knowledge
WITH (security_invoker = true) AS
SELECT
  k.id,
  k.learning,
  k.typ,
  k.status,
  k.valid_from,
  count(e.id) AS belege,
  CASE
    WHEN count(e.id) >= 3 AND k.status = 'Hypothese'::sales.knowledge_status THEN 'reif fuer Bestaetigt'
    ELSE NULL
  END AS hinweis
FROM sales.knowledge k
LEFT JOIN sales.knowledge_evidence e ON e.knowledge_id = k.id
WHERE k.status <> 'Veraltet'::sales.knowledge_status
GROUP BY k.id;

-- RPCs (pre-hardening signatures; hardening migration replaces these)
CREATE OR REPLACE FUNCTION sales.log_touch(
  p_company_id uuid,
  p_kanal sales.touch_kanal,
  p_ergebnis sales.touch_ergebnis DEFAULT 'kein_ergebnis'::sales.touch_ergebnis,
  p_person_id uuid DEFAULT NULL,
  p_notiz text DEFAULT NULL,
  p_naechster date DEFAULT NULL,
  p_abbruch sales.abbruchgrund DEFAULT NULL
)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  selected_person_id uuid := p_person_id;
  touch_id bigint;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Nicht authentifiziert'; END IF;
  IF NOT EXISTS (SELECT 1 FROM sales.companies WHERE id = p_company_id) THEN
    RAISE EXCEPTION 'Firma nicht gefunden';
  END IF;
  IF selected_person_id IS NULL THEN
    SELECT id INTO selected_person_id FROM sales.people
    WHERE company_id = p_company_id
    ORDER BY ist_entscheider DESC, created_at LIMIT 1;
  END IF;
  INSERT INTO sales.touchpoints(company_id, person_id, kanal, ergebnis, notiz, naechster_touch, abbruchgrund)
  VALUES (p_company_id, selected_person_id, p_kanal, p_ergebnis, p_notiz, p_naechster, p_abbruch)
  RETURNING id INTO touch_id;
  RETURN touch_id;
END;
$$;

CREATE OR REPLACE FUNCTION sales.pipeline_status_counts()
RETURNS jsonb LANGUAGE sql STABLE SET search_path = sales, public AS $$
  SELECT COALESCE(
    jsonb_agg(jsonb_build_object('status', pipeline_status::text, 'n', n) ORDER BY n DESC),
    '[]'::jsonb
  )
  FROM (
    SELECT pipeline_status, count(*)::int AS n
    FROM sales.companies
    GROUP BY 1
  ) s;
$$;

-- Triggers
DROP TRIGGER IF EXISTS companies_fill_geo ON sales.companies;
CREATE TRIGGER companies_fill_geo
  BEFORE INSERT OR UPDATE ON sales.companies
  FOR EACH ROW EXECUTE FUNCTION sales.fill_geo();

DROP TRIGGER IF EXISTS companies_updated_at ON sales.companies;
CREATE TRIGGER companies_updated_at
  BEFORE UPDATE ON sales.companies
  FOR EACH ROW EXECUTE FUNCTION sales.touch_updated_at();

DROP TRIGGER IF EXISTS trg_company_qualification_audit ON sales.companies;
CREATE TRIGGER trg_company_qualification_audit
  AFTER UPDATE ON sales.companies
  FOR EACH ROW EXECUTE FUNCTION sales.log_qualification_change();

DROP TRIGGER IF EXISTS touchpoints_append_only ON sales.touchpoints;
CREATE TRIGGER touchpoints_append_only
  BEFORE DELETE OR UPDATE ON sales.touchpoints
  FOR EACH ROW EXECUTE FUNCTION sales.deny_mutation();

-- Pre-hardening grants and RLS (replaced by harden_sales_security_integrity)
GRANT USAGE ON SCHEMA sales TO anon, authenticated, service_role;
GRANT SELECT ON ALL TABLES IN SCHEMA sales TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA sales TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA sales TO service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA sales TO authenticated, service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA sales TO authenticated, service_role;

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT c.relname AS tablename
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'sales' AND c.relkind = 'r'
  LOOP
    EXECUTE format('ALTER TABLE sales.%I ENABLE ROW LEVEL SECURITY', r.tablename);
    EXECUTE format('DROP POLICY IF EXISTS authenticated_all ON sales.%I', r.tablename);
    EXECUTE format(
      'CREATE POLICY authenticated_all ON sales.%I FOR ALL TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL)',
      r.tablename
    );
  END LOOP;
END $$;

ALTER ROLE authenticator SET pgrst.db_schemas = 'public, storage, graphql_public, sales';
NOTIFY pgrst, 'reload config';
NOTIFY pgrst, 'reload schema';
-- Akquise KPI RPC + website on list views
-- Applied remotely as sales_akquise_kpis_and_liste_website_v2

CREATE OR REPLACE FUNCTION sales.akquise_kpis(p_from timestamptz, p_to timestamptz)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = sales, public
AS $$
WITH base AS (
  SELECT *
  FROM sales.touchpoints t
  WHERE t.kanal IN ('call'::sales.touch_kanal, 'dm'::sales.touch_kanal)
    AND t.occurred_at >= p_from
    AND t.occurred_at < p_to
),
totals AS (
  SELECT
    count(*) FILTER (WHERE kanal = 'call') AS dials,
    count(*) FILTER (WHERE kanal = 'dm') AS dms,
    count(*) FILTER (WHERE ergebnis <> 'nicht_erreicht') AS connects,
    count(*) FILTER (WHERE ergebnis = ANY (ARRAY[
      'gespraech_ohne_termin'::sales.touch_ergebnis,
      'disqualifiziert'::sales.touch_ergebnis,
      'termin_gebucht'::sales.touch_ergebnis
    ])) AS conversations,
    count(*) FILTER (WHERE ergebnis = 'termin_gebucht') AS appointments,
    count(*) AS total_touches
  FROM base
),
series AS (
  SELECT
    date_trunc('day', occurred_at)::date AS bucket,
    count(*) FILTER (WHERE kanal = 'call') AS dials,
    count(*) FILTER (WHERE kanal = 'dm') AS dms,
    count(*) FILTER (WHERE ergebnis = 'termin_gebucht') AS appointments
  FROM base
  GROUP BY 1
  ORDER BY 1
),
status_mix AS (
  SELECT ergebnis::text AS ergebnis, count(*)::int AS n
  FROM base
  GROUP BY 1
  ORDER BY n DESC
)
SELECT jsonb_build_object(
  'from', p_from,
  'to', p_to,
  'totals', (
    SELECT jsonb_build_object(
      'dials', dials,
      'dms', dms,
      'connects', connects,
      'conversations', conversations,
      'appointments', appointments,
      'total_touches', total_touches,
      'connect_rate_pct', ROUND(100.0 * connects / NULLIF(dials + dms, 0), 1),
      'appointment_rate_pct', ROUND(100.0 * appointments / NULLIF(conversations, 0), 1)
    ) FROM totals
  ),
  'series', COALESCE((SELECT jsonb_agg(jsonb_build_object(
    'bucket', bucket,
    'dials', dials,
    'dms', dms,
    'appointments', appointments
  ) ORDER BY bucket) FROM series), '[]'::jsonb),
  'status_mix', COALESCE((SELECT jsonb_agg(jsonb_build_object(
    'ergebnis', ergebnis,
    'n', n
  ) ORDER BY n DESC) FROM status_mix), '[]'::jsonb)
);
$$;

REVOKE ALL ON FUNCTION sales.akquise_kpis(timestamptz, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION sales.akquise_kpis(timestamptz, timestamptz) FROM anon;
GRANT EXECUTE ON FUNCTION sales.akquise_kpis(timestamptz, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION sales.akquise_kpis(timestamptz, timestamptz) TO service_role;
-- Action-oriented analytics dashboard for authenticated sales users.
-- Touch funnel and current company pipeline remain separate concepts.
CREATE OR REPLACE FUNCTION sales.analytics_dashboard(
  p_from timestamptz,
  p_to timestamptz
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = sales, public
AS $$
WITH
params AS (
  SELECT
    p_from AS current_from,
    p_to AS current_to,
    p_to - p_from AS period_length,
    CASE
      WHEN p_to - p_from <= interval '2 days' THEN 'hour'
      WHEN p_to - p_from <= interval '45 days' THEN 'day'
      WHEN p_to - p_from <= interval '120 days' THEN 'week'
      ELSE 'month'
    END AS grain
),
current_base AS (
  SELECT t.*
  FROM sales.touchpoints t
  WHERE t.kanal IN ('call'::sales.touch_kanal, 'dm'::sales.touch_kanal)
    AND t.occurred_at >= p_from
    AND t.occurred_at < p_to
),
prior_base AS (
  SELECT t.*
  FROM sales.touchpoints t, params p
  WHERE t.kanal IN ('call'::sales.touch_kanal, 'dm'::sales.touch_kanal)
    AND t.occurred_at >= p.current_from - p.period_length
    AND t.occurred_at < p.current_from
),
current_totals AS (
  SELECT
    count(*)::int AS attempts,
    count(*) FILTER (WHERE kanal = 'call')::int AS dials,
    count(*) FILTER (WHERE kanal = 'dm')::int AS dms,
    count(*) FILTER (WHERE ergebnis <> 'nicht_erreicht')::int AS connects,
    count(*) FILTER (WHERE ergebnis = ANY (ARRAY[
      'gespraech_ohne_termin'::sales.touch_ergebnis,
      'disqualifiziert'::sales.touch_ergebnis,
      'termin_gebucht'::sales.touch_ergebnis
    ]))::int AS conversations,
    count(*) FILTER (WHERE ergebnis = 'termin_gebucht')::int AS appointments
  FROM current_base
),
prior_totals AS (
  SELECT
    count(*)::int AS attempts,
    count(*) FILTER (WHERE ergebnis <> 'nicht_erreicht')::int AS connects,
    count(*) FILTER (WHERE ergebnis = ANY (ARRAY[
      'gespraech_ohne_termin'::sales.touch_ergebnis,
      'disqualifiziert'::sales.touch_ergebnis,
      'termin_gebucht'::sales.touch_ergebnis
    ]))::int AS conversations,
    count(*) FILTER (WHERE ergebnis = 'termin_gebucht')::int AS appointments
  FROM prior_base
),
channel_stats AS (
  SELECT
    channel.kanal,
    count(b.id)::int AS attempts,
    count(b.id) FILTER (WHERE b.ergebnis <> 'nicht_erreicht')::int AS connects,
    count(b.id) FILTER (WHERE b.ergebnis = ANY (ARRAY[
      'gespraech_ohne_termin'::sales.touch_ergebnis,
      'disqualifiziert'::sales.touch_ergebnis,
      'termin_gebucht'::sales.touch_ergebnis
    ]))::int AS conversations,
    count(b.id) FILTER (WHERE b.ergebnis = 'termin_gebucht')::int AS appointments
  FROM (
    VALUES ('call'::sales.touch_kanal), ('dm'::sales.touch_kanal)
  ) AS channel(kanal)
  LEFT JOIN current_base b ON b.kanal = channel.kanal
  GROUP BY channel.kanal
),
trend AS (
  SELECT
    date_trunc((SELECT grain FROM params), occurred_at) AS bucket,
    count(*) FILTER (WHERE kanal = 'call')::int AS dials,
    count(*) FILTER (WHERE kanal = 'dm')::int AS dms,
    count(*) FILTER (WHERE ergebnis = 'termin_gebucht')::int AS appointments
  FROM current_base
  GROUP BY 1
  ORDER BY 1
),
today_actions AS (
  SELECT
    count(*) FILTER (WHERE naechster_touch = CURRENT_DATE)::int AS due_today,
    count(*) FILTER (WHERE naechster_touch < CURRENT_DATE)::int AS overdue,
    count(*) FILTER (WHERE status = 'callback'::sales.pipeline_status)::int AS callbacks
  FROM sales.v_call_liste
),
today_contacted AS (
  SELECT count(DISTINCT company_id)::int AS companies
  FROM sales.touchpoints
  WHERE kanal IN ('call'::sales.touch_kanal, 'dm'::sales.touch_kanal)
    AND occurred_at >= CURRENT_DATE
    AND occurred_at < CURRENT_DATE + interval '1 day'
),
pipeline AS (
  SELECT pipeline_status, count(*)::int AS n
  FROM sales.companies
  WHERE relationship = 'Prospect'::sales.relationship
  GROUP BY pipeline_status
),
company_counts AS (
  SELECT
    count(*) FILTER (WHERE relationship = 'Kunde'::sales.relationship)::int AS customers,
    count(*) FILTER (
      WHERE relationship = 'Ausgeschlossen'::sales.relationship
         OR pipeline_status = 'disqualified'::sales.pipeline_status
    )::int AS disqualified
  FROM sales.companies
),
commercial AS (
  SELECT
    count(*)::int AS total_opportunities,
    count(*) FILTER (WHERE stage = 'offen'::sales.opp_stage)::int AS open_opportunities,
    count(*) FILTER (WHERE stage = 'angebot_raus'::sales.opp_stage)::int AS open_offers,
    count(*) FILTER (
      WHERE stage = 'gewonnen'::sales.opp_stage
        AND closed_at >= p_from AND closed_at < p_to
    )::int AS won,
    count(*) FILTER (
      WHERE stage = 'verloren'::sales.opp_stage
        AND closed_at >= p_from AND closed_at < p_to
    )::int AS lost,
    COALESCE(sum(setup_preis) FILTER (
      WHERE stage = 'gewonnen'::sales.opp_stage
        AND closed_at >= p_from AND closed_at < p_to
    ), 0) AS won_setup_revenue,
    COALESCE(sum(retainer_monatlich) FILTER (
      WHERE stage = 'gewonnen'::sales.opp_stage
        AND closed_at >= p_from AND closed_at < p_to
    ), 0) AS won_monthly_retainer,
    COALESCE(sum(setup_preis) FILTER (
      WHERE stage IN ('offen'::sales.opp_stage, 'angebot_raus'::sales.opp_stage)
    ), 0) AS open_setup_value
  FROM sales.opportunities
)
SELECT jsonb_build_object(
  'from', p_from,
  'to', p_to,
  'grain', (SELECT grain FROM params),
  'summary', (
    SELECT jsonb_build_object(
      'attempts', c.attempts,
      'dials', c.dials,
      'dms', c.dms,
      'connects', c.connects,
      'conversations', c.conversations,
      'appointments', c.appointments,
      'connect_rate_pct', round(100.0 * c.connects / NULLIF(c.attempts, 0), 1),
      'appointment_rate_pct', round(100.0 * c.appointments / NULLIF(c.conversations, 0), 1),
      'prior', jsonb_build_object(
        'attempts', p.attempts,
        'connects', p.connects,
        'conversations', p.conversations,
        'appointments', p.appointments,
        'connect_rate_pct', round(100.0 * p.connects / NULLIF(p.attempts, 0), 1),
        'appointment_rate_pct', round(100.0 * p.appointments / NULLIF(p.conversations, 0), 1)
      )
    )
    FROM current_totals c CROSS JOIN prior_totals p
  ),
  'funnel', (
    SELECT jsonb_build_array(
      jsonb_build_object('key', 'attempts', 'value', attempts, 'conversion_pct', 100),
      jsonb_build_object(
        'key', 'connects',
        'value', connects,
        'conversion_pct', round(100.0 * connects / NULLIF(attempts, 0), 1)
      ),
      jsonb_build_object(
        'key', 'conversations',
        'value', conversations,
        'conversion_pct', round(100.0 * conversations / NULLIF(connects, 0), 1)
      ),
      jsonb_build_object(
        'key', 'appointments',
        'value', appointments,
        'conversion_pct', round(100.0 * appointments / NULLIF(conversations, 0), 1)
      )
    )
    FROM current_totals
  ),
  'channels', COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'channel', kanal::text,
      'attempts', attempts,
      'connects', connects,
      'conversations', conversations,
      'appointments', appointments,
      'connect_rate_pct', round(100.0 * connects / NULLIF(attempts, 0), 1),
      'appointment_rate_pct', round(100.0 * appointments / NULLIF(conversations, 0), 1)
    ) ORDER BY kanal)
    FROM channel_stats
  ), '[]'::jsonb),
  'trend', COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'bucket', bucket,
      'dials', dials,
      'dms', dms,
      'appointments', appointments
    ) ORDER BY bucket)
    FROM trend
  ), '[]'::jsonb),
  'actions', (
    SELECT jsonb_build_object(
      'due_today', a.due_today,
      'overdue', a.overdue,
      'callbacks', a.callbacks,
      'contacted_today', t.companies
    )
    FROM today_actions a CROSS JOIN today_contacted t
  ),
  'pipeline', COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'status', pipeline_status::text,
      'n', n
    ) ORDER BY n DESC)
    FROM pipeline
  ), '[]'::jsonb),
  'company_counts', (
    SELECT jsonb_build_object(
      'customers', customers,
      'disqualified', disqualified
    )
    FROM company_counts
  ),
  'commercial', (
    SELECT jsonb_build_object(
      'total_opportunities', total_opportunities,
      'open_opportunities', open_opportunities,
      'open_offers', open_offers,
      'won', won,
      'lost', lost,
      'won_setup_revenue', won_setup_revenue,
      'won_monthly_retainer', won_monthly_retainer,
      'open_setup_value', open_setup_value,
      'close_rate_pct', round(100.0 * won / NULLIF(won + lost, 0), 1)
    )
    FROM commercial
  )
);
$$;

REVOKE ALL ON FUNCTION sales.analytics_dashboard(timestamptz, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION sales.analytics_dashboard(timestamptz, timestamptz) FROM anon;
GRANT EXECUTE ON FUNCTION sales.analytics_dashboard(timestamptz, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION sales.analytics_dashboard(timestamptz, timestamptz) TO service_role;
