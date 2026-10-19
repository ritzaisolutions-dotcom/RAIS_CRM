-- Close-style jobs: tasks, templates, sequences, workflows, saved views,
-- and richer opportunity fields. Enum values sms/note/task land in the
-- preceding migration. Touchpoints remain append-only via sales.log_touch.

-- ---------------------------------------------------------------------------
-- 1. Tasks (due dates in business calendar; completion logs a touch)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sales.tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES sales.companies(id) ON DELETE CASCADE,
  person_id uuid REFERENCES sales.people(id) ON DELETE SET NULL,
  titel text NOT NULL,
  notiz text,
  due_on date NOT NULL,
  status text NOT NULL DEFAULT 'offen'
    CHECK (status IN ('offen', 'erledigt', 'storniert')),
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  created_by uuid,
  CONSTRAINT tasks_completed_check CHECK (
    (status = 'erledigt') = (completed_at IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS tasks_company_idx ON sales.tasks (company_id, due_on);
CREATE INDEX IF NOT EXISTS tasks_open_due_idx
  ON sales.tasks (due_on)
  WHERE status = 'offen';

ALTER TABLE sales.tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tasks_select ON sales.tasks;
CREATE POLICY tasks_select ON sales.tasks
  FOR SELECT TO authenticated
  USING ((SELECT sales.is_app_user()));
DROP POLICY IF EXISTS tasks_insert ON sales.tasks;
CREATE POLICY tasks_insert ON sales.tasks
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT sales.is_app_user()));
DROP POLICY IF EXISTS tasks_update ON sales.tasks;
CREATE POLICY tasks_update ON sales.tasks
  FOR UPDATE TO authenticated
  USING ((SELECT sales.is_app_user()))
  WITH CHECK ((SELECT sales.is_app_user()));

GRANT SELECT, INSERT, UPDATE ON sales.tasks TO authenticated;

CREATE OR REPLACE FUNCTION sales.create_task(
  p_company_id uuid,
  p_titel text,
  p_due_on date,
  p_person_id uuid DEFAULT NULL,
  p_notiz text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = sales, public
AS $$
DECLARE
  new_id uuid;
BEGIN
  IF NOT sales.is_app_user() THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  IF p_person_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM sales.people
    WHERE id = p_person_id AND company_id = p_company_id
  ) THEN
    RAISE EXCEPTION 'person does not belong to company';
  END IF;

  INSERT INTO sales.tasks (company_id, person_id, titel, notiz, due_on, created_by)
  VALUES (
    p_company_id,
    p_person_id,
    trim(p_titel),
    NULLIF(trim(p_notiz), ''),
    p_due_on,
    auth.uid()
  )
  RETURNING id INTO new_id;

  PERFORM sales.log_touch(
    p_company_id,
    'task'::sales.touch_kanal,
    'kein_ergebnis'::sales.touch_ergebnis,
    p_person_id,
    'Aufgabe angelegt: ' || trim(p_titel)
      || COALESCE(E'\n' || NULLIF(trim(p_notiz), ''), ''),
    p_due_on,
    NULL
  );

  RETURN new_id;
END;
$$;

CREATE OR REPLACE FUNCTION sales.complete_task(p_task_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = sales, public
AS $$
DECLARE
  t sales.tasks%ROWTYPE;
BEGIN
  IF NOT sales.is_app_user() THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  SELECT * INTO t FROM sales.tasks WHERE id = p_task_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'task not found';
  END IF;
  IF t.status <> 'offen' THEN
    RETURN;
  END IF;

  UPDATE sales.tasks
  SET status = 'erledigt', completed_at = now()
  WHERE id = p_task_id;

  PERFORM sales.log_touch(
    t.company_id,
    'task'::sales.touch_kanal,
    'kein_ergebnis'::sales.touch_ergebnis,
    t.person_id,
    'Aufgabe erledigt: ' || t.titel,
    NULL,
    NULL
  );
END;
$$;

REVOKE ALL ON FUNCTION sales.create_task(uuid, text, date, uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION sales.complete_task(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION sales.create_task(uuid, text, date, uuid, text)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION sales.complete_task(uuid)
  TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. Email templates + outbound log (provider optional via env)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sales.email_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  subject text NOT NULL,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);

ALTER TABLE sales.email_templates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS email_templates_all ON sales.email_templates;
CREATE POLICY email_templates_all ON sales.email_templates
  FOR ALL TO authenticated
  USING ((SELECT sales.is_app_user()))
  WITH CHECK ((SELECT sales.is_app_user()));
GRANT SELECT, INSERT, UPDATE, DELETE ON sales.email_templates TO authenticated;

CREATE TABLE IF NOT EXISTS sales.email_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES sales.companies(id) ON DELETE CASCADE,
  person_id uuid REFERENCES sales.people(id) ON DELETE SET NULL,
  template_id uuid REFERENCES sales.email_templates(id) ON DELETE SET NULL,
  direction text NOT NULL DEFAULT 'outbound'
    CHECK (direction IN ('outbound', 'inbound')),
  to_email text NOT NULL,
  subject text NOT NULL,
  body text NOT NULL,
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'sent', 'failed', 'received')),
  provider_ref text,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);

CREATE INDEX IF NOT EXISTS email_messages_company_idx
  ON sales.email_messages (company_id, created_at DESC);

ALTER TABLE sales.email_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS email_messages_select ON sales.email_messages;
CREATE POLICY email_messages_select ON sales.email_messages
  FOR SELECT TO authenticated
  USING ((SELECT sales.is_app_user()));
DROP POLICY IF EXISTS email_messages_insert ON sales.email_messages;
CREATE POLICY email_messages_insert ON sales.email_messages
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT sales.is_app_user()));
DROP POLICY IF EXISTS email_messages_update ON sales.email_messages;
CREATE POLICY email_messages_update ON sales.email_messages
  FOR UPDATE TO authenticated
  USING ((SELECT sales.is_app_user()))
  WITH CHECK ((SELECT sales.is_app_user()));
GRANT SELECT, INSERT, UPDATE ON sales.email_messages TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. SMS outbox (provider optional)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sales.sms_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES sales.companies(id) ON DELETE CASCADE,
  person_id uuid REFERENCES sales.people(id) ON DELETE SET NULL,
  direction text NOT NULL DEFAULT 'outbound'
    CHECK (direction IN ('outbound', 'inbound')),
  to_phone text NOT NULL,
  body text NOT NULL,
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'sent', 'failed', 'received')),
  provider_ref text,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);

CREATE INDEX IF NOT EXISTS sms_messages_company_idx
  ON sales.sms_messages (company_id, created_at DESC);

ALTER TABLE sales.sms_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sms_messages_select ON sales.sms_messages;
CREATE POLICY sms_messages_select ON sales.sms_messages
  FOR SELECT TO authenticated
  USING ((SELECT sales.is_app_user()));
DROP POLICY IF EXISTS sms_messages_insert ON sales.sms_messages;
CREATE POLICY sms_messages_insert ON sales.sms_messages
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT sales.is_app_user()));
DROP POLICY IF EXISTS sms_messages_update ON sales.sms_messages;
CREATE POLICY sms_messages_update ON sales.sms_messages
  FOR UPDATE TO authenticated
  USING ((SELECT sales.is_app_user()))
  WITH CHECK ((SELECT sales.is_app_user()));
GRANT SELECT, INSERT, UPDATE ON sales.sms_messages TO authenticated;

-- ---------------------------------------------------------------------------
-- 5. Sequences
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sales.sequences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);

CREATE TABLE IF NOT EXISTS sales.sequence_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sequence_id uuid NOT NULL REFERENCES sales.sequences(id) ON DELETE CASCADE,
  step_order int NOT NULL,
  kanal text NOT NULL CHECK (kanal IN ('email', 'call', 'sms', 'task')),
  delay_days int NOT NULL DEFAULT 0 CHECK (delay_days >= 0),
  subject text,
  body text,
  task_titel text,
  UNIQUE (sequence_id, step_order)
);

CREATE TABLE IF NOT EXISTS sales.sequence_enrollments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sequence_id uuid NOT NULL REFERENCES sales.sequences(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES sales.companies(id) ON DELETE CASCADE,
  person_id uuid REFERENCES sales.people(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'aktiv'
    CHECK (status IN ('aktiv', 'pausiert', 'gestoppt', 'fertig')),
  current_step int NOT NULL DEFAULT 0,
  next_run_on date,
  stop_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);

CREATE INDEX IF NOT EXISTS sequence_enrollments_company_idx
  ON sales.sequence_enrollments (company_id, status);

ALTER TABLE sales.sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales.sequence_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales.sequence_enrollments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sequences_all ON sales.sequences;
CREATE POLICY sequences_all ON sales.sequences
  FOR ALL TO authenticated
  USING ((SELECT sales.is_app_user()))
  WITH CHECK ((SELECT sales.is_app_user()));
DROP POLICY IF EXISTS sequence_steps_all ON sales.sequence_steps;
CREATE POLICY sequence_steps_all ON sales.sequence_steps
  FOR ALL TO authenticated
  USING ((SELECT sales.is_app_user()))
  WITH CHECK ((SELECT sales.is_app_user()));
DROP POLICY IF EXISTS sequence_enrollments_all ON sales.sequence_enrollments;
CREATE POLICY sequence_enrollments_all ON sales.sequence_enrollments
  FOR ALL TO authenticated
  USING ((SELECT sales.is_app_user()))
  WITH CHECK ((SELECT sales.is_app_user()));

GRANT SELECT, INSERT, UPDATE, DELETE ON sales.sequences TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON sales.sequence_steps TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON sales.sequence_enrollments TO authenticated;

-- Stop active enrollments when an inbound-style touch lands (reply).
CREATE OR REPLACE FUNCTION sales.stop_sequences_on_reply()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = sales, public
AS $$
BEGIN
  IF NEW.voided_at IS NOT NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.kanal IN (
    'email'::sales.touch_kanal,
    'sms'::sales.touch_kanal,
    'call'::sales.touch_kanal,
    'dm'::sales.touch_kanal
  ) AND NEW.ergebnis IN (
    'erreicht_ohne_gespraech'::sales.touch_ergebnis,
    'gespraech_ohne_termin'::sales.touch_ergebnis,
    'termin_gebucht'::sales.touch_ergebnis
  ) THEN
    UPDATE sales.sequence_enrollments
    SET status = 'gestoppt',
        stop_reason = 'Antwort / Gespräch erfasst'
    WHERE company_id = NEW.company_id
      AND status = 'aktiv';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS touchpoints_stop_sequences ON sales.touchpoints;
CREATE TRIGGER touchpoints_stop_sequences
  AFTER INSERT ON sales.touchpoints
  FOR EACH ROW
  EXECUTE FUNCTION sales.stop_sequences_on_reply();

-- ---------------------------------------------------------------------------
-- 6. Workflow rules (status → task)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sales.workflow_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  trigger_pipeline_status sales.pipeline_status NOT NULL,
  action_type text NOT NULL DEFAULT 'create_task'
    CHECK (action_type IN ('create_task')),
  task_titel text NOT NULL,
  task_due_days int NOT NULL DEFAULT 1 CHECK (task_due_days >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);

ALTER TABLE sales.workflow_rules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS workflow_rules_all ON sales.workflow_rules;
CREATE POLICY workflow_rules_all ON sales.workflow_rules
  FOR ALL TO authenticated
  USING ((SELECT sales.is_app_user()))
  WITH CHECK ((SELECT sales.is_app_user()));
GRANT SELECT, INSERT, UPDATE, DELETE ON sales.workflow_rules TO authenticated;

CREATE OR REPLACE FUNCTION sales.run_pipeline_workflows()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = sales, public
AS $$
DECLARE
  rule sales.workflow_rules%ROWTYPE;
  due date;
BEGIN
  IF NEW.pipeline_status IS NOT DISTINCT FROM OLD.pipeline_status THEN
    RETURN NEW;
  END IF;

  FOR rule IN
    SELECT * FROM sales.workflow_rules
    WHERE active AND trigger_pipeline_status = NEW.pipeline_status
  LOOP
    due := (sales.business_today() + rule.task_due_days)::date;
    PERFORM sales.create_task(
      NEW.id,
      rule.task_titel,
      due,
      NULL,
      'Workflow: ' || rule.name
    );
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS companies_run_workflows ON sales.companies;
CREATE TRIGGER companies_run_workflows
  AFTER UPDATE OF pipeline_status ON sales.companies
  FOR EACH ROW
  EXECUTE FUNCTION sales.run_pipeline_workflows();

-- ---------------------------------------------------------------------------
-- 7. Saved views
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sales.saved_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  scope text NOT NULL DEFAULT 'liste'
    CHECK (scope IN ('liste', 'kunden')),
  filters jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);

ALTER TABLE sales.saved_views ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS saved_views_all ON sales.saved_views;
CREATE POLICY saved_views_all ON sales.saved_views
  FOR ALL TO authenticated
  USING ((SELECT sales.is_app_user()))
  WITH CHECK ((SELECT sales.is_app_user()));
GRANT SELECT, INSERT, UPDATE, DELETE ON sales.saved_views TO authenticated;

-- ---------------------------------------------------------------------------
-- 8. Richer opportunities
-- ---------------------------------------------------------------------------
ALTER TABLE sales.opportunities
  ADD COLUMN IF NOT EXISTS titel text,
  ADD COLUMN IF NOT EXISTS erwarteter_umsatz numeric(12, 2);

-- ---------------------------------------------------------------------------
-- 9. Open tasks on call list (helper view)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW sales.v_open_tasks
WITH (security_invoker = true)
AS
SELECT
  t.id,
  t.company_id,
  c.name AS firma,
  t.titel,
  t.due_on,
  t.status,
  t.person_id,
  t.notiz,
  t.created_at
FROM sales.tasks t
JOIN sales.companies c ON c.id = t.company_id
WHERE t.status = 'offen';

GRANT SELECT ON sales.v_open_tasks TO authenticated;
