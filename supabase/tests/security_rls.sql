\set ON_ERROR_STOP on

-- Self-contained RLS / integrity suite.
-- Prepares auth + allowlist fixtures, runs the matrix, then rolls everything back.
BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.assert_true(condition boolean, message text)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT coalesce(condition, false) THEN
    RAISE EXCEPTION 'Security assertion failed: %', message;
  END IF;
END;
$$;

-- Stable fixture identities for this transaction only.
SELECT set_config('test.allowlisted_user', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', true);
SELECT set_config('test.non_app_user', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', true);

-- Ensure Auth users exist for JWT claim simulation (staging / local only).
INSERT INTO auth.users (
  id,
  instance_id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
)
VALUES
  (
    current_setting('test.allowlisted_user')::uuid,
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'crm-allowlisted@staging.invalid',
    crypt('staging-test-password', gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  ),
  (
    current_setting('test.non_app_user')::uuid,
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'crm-non-app@staging.invalid',
    crypt('staging-test-password', gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  )
ON CONFLICT (id) DO NOTHING;

INSERT INTO sales.app_users (user_id, email, notiz)
VALUES (
  current_setting('test.allowlisted_user')::uuid,
  'crm-allowlisted@staging.invalid',
  'security_rls fixture'
)
ON CONFLICT (user_id) DO UPDATE
SET email = EXCLUDED.email, notiz = EXCLUDED.notiz;

SELECT pg_temp.assert_true(
  NOT has_schema_privilege('anon', 'sales', 'USAGE'),
  'anon must not have sales schema usage'
);
SELECT pg_temp.assert_true(
  NOT has_table_privilege('authenticated', 'sales.companies', 'DELETE'),
  'companies must not be deletable'
);
SELECT pg_temp.assert_true(
  NOT has_table_privilege('authenticated', 'sales.touchpoints', 'UPDATE')
    AND NOT has_table_privilege('authenticated', 'sales.touchpoints', 'DELETE'),
  'touchpoints must be append-only'
);
SELECT pg_temp.assert_true(
  NOT has_table_privilege('authenticated', 'sales.opportunities', 'DELETE'),
  'opportunities must not be deletable'
);
SELECT pg_temp.assert_true(
  NOT has_table_privilege('authenticated', 'sales.app_users', 'INSERT')
    AND NOT has_table_privilege('authenticated', 'sales.app_users', 'UPDATE')
    AND NOT has_table_privilege('authenticated', 'sales.app_users', 'DELETE'),
  'authenticated users must not manage the allowlist'
);
SELECT pg_temp.assert_true(
  has_column_privilege('authenticated', 'sales.companies', 'name', 'INSERT')
    AND has_column_privilege(
      'authenticated',
      'sales.companies',
      'website',
      'UPDATE'
    )
    AND NOT has_column_privilege(
      'authenticated',
      'sales.companies',
      'bundesland',
      'INSERT'
    )
    AND NOT has_column_privilege(
      'authenticated',
      'sales.companies',
      'pipeline_status',
      'UPDATE'
    ),
  'company write grants must remain column-scoped'
);
SELECT pg_temp.assert_true(
  NOT has_column_privilege(
    'authenticated',
    'sales.people',
    'company_id',
    'UPDATE'
  )
    AND NOT has_column_privilege(
      'authenticated',
      'sales.touchpoints',
      'source_key',
      'INSERT'
    ),
  'relationship keys and import metadata must not be client-writable'
);
SELECT pg_temp.assert_true(
  EXISTS (
    SELECT 1
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'sales'
      AND c.relname = 'touchpoints'
      AND t.tgname = 'touchpoints_append_only'
      AND NOT t.tgisinternal
  ),
  'touchpoints_append_only trigger must exist'
);

-- Anonymous users cannot even resolve the exposed schema.
SET LOCAL ROLE anon;
DO $$
BEGIN
  BEGIN
    PERFORM 1 FROM sales.companies LIMIT 1;
    RAISE EXCEPTION 'anon unexpectedly read sales.companies';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
  END;
END;
$$;
RESET ROLE;

-- A valid JWT that is not in app_users sees no rows and cannot call writes.
SELECT set_config(
  'request.jwt.claim.sub',
  current_setting('test.non_app_user'),
  true
);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.assert_true(
  (SELECT count(*) FROM sales.companies) = 0,
  'non-allowlisted users must see zero companies'
);
DO $$
BEGIN
  BEGIN
    PERFORM sales.create_company(p_name => 'SECURITY-NON-APP');
    RAISE EXCEPTION 'non-allowlisted user unexpectedly called create_company';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
  END;
END;
$$;
RESET ROLE;

-- Run mutation and transaction tests as an allowlisted user.
SELECT set_config(
  'request.jwt.claim.sub',
  current_setting('test.allowlisted_user'),
  true
);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SET LOCAL ROLE authenticated;

SELECT set_config(
  'test.company_id',
  sales.create_company(
    p_name => 'SECURITY-ATOMIC-BASE',
    p_website => 'https://security-test.invalid',
    p_person_name => 'Security Test',
    p_person_email => 'security-atomic@example.invalid'
  )::text,
  true
);

SELECT pg_temp.assert_true(
  EXISTS (
    SELECT 1
    FROM sales.companies c
    JOIN sales.people p ON p.company_id = c.id
    WHERE c.id = current_setting('test.company_id')::uuid
      AND p.email = 'security-atomic@example.invalid'
  ),
  'company and optional decision maker must commit together'
);

DO $$
BEGIN
  BEGIN
    PERFORM sales.create_company(
      p_name => 'SECURITY-SHOULD-ROLLBACK',
      p_person_name => 'Duplicate',
      p_person_email => 'security-atomic@example.invalid'
    );
    RAISE EXCEPTION 'duplicate person email unexpectedly succeeded';
  EXCEPTION
    WHEN unique_violation THEN NULL;
  END;

  IF EXISTS (
    SELECT 1
    FROM sales.companies
    WHERE name = 'SECURITY-SHOULD-ROLLBACK'
  ) THEN
    RAISE EXCEPTION 'company insert did not roll back with person insert';
  END IF;
END;
$$;

SELECT sales.set_pipeline_status(
  current_setting('test.company_id')::uuid,
  'callback'::sales.pipeline_status,
  'call'::sales.touch_kanal,
  current_date + 1
);

SELECT pg_temp.assert_true(
  EXISTS (
    SELECT 1
    FROM sales.touchpoints
    WHERE company_id = current_setting('test.company_id')::uuid
      AND notiz = 'Pipeline → Rückruf'
  ),
  'status change and touch must commit together'
);

DO $$
BEGIN
  BEGIN
    UPDATE sales.touchpoints
    SET notiz = 'illegal'
    WHERE company_id = current_setting('test.company_id')::uuid;
    RAISE EXCEPTION 'touchpoint update unexpectedly succeeded';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
    WHEN raise_exception THEN
      IF SQLERRM NOT LIKE '%append-only%' THEN
        RAISE;
      END IF;
  END;

  BEGIN
    DELETE FROM sales.touchpoints
    WHERE company_id = current_setting('test.company_id')::uuid;
    RAISE EXCEPTION 'touchpoint delete unexpectedly succeeded';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
    WHEN raise_exception THEN
      IF SQLERRM NOT LIKE '%append-only%' THEN
        RAISE;
      END IF;
  END;

  BEGIN
    DELETE FROM sales.companies
    WHERE id = current_setting('test.company_id')::uuid;
    RAISE EXCEPTION 'company delete unexpectedly succeeded';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
  END;
END;
$$;

RESET ROLE;

CREATE OR REPLACE FUNCTION pg_temp.reject_pipeline_touch()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'forced touch failure';
END;
$$;
CREATE TRIGGER security_reject_pipeline_touch
  BEFORE INSERT ON sales.touchpoints
  FOR EACH ROW
  WHEN (NEW.notiz LIKE 'Pipeline →%')
  EXECUTE FUNCTION pg_temp.reject_pipeline_touch();

SELECT set_config(
  'test.previous_pipeline',
  (
    SELECT pipeline_status::text
    FROM sales.companies
    WHERE id = current_setting('test.company_id')::uuid
  ),
  true
);
SELECT set_config(
  'test.previous_touch_count',
  (
    SELECT count(*)::text
    FROM sales.touchpoints
    WHERE company_id = current_setting('test.company_id')::uuid
  ),
  true
);

SET LOCAL ROLE authenticated;
DO $$
BEGIN
  BEGIN
    PERFORM sales.set_pipeline_status(
      current_setting('test.company_id')::uuid,
      'closed'::sales.pipeline_status,
      'call'::sales.touch_kanal,
      current_date + 2
    );
    RAISE EXCEPTION 'forced touch failure unexpectedly succeeded';
  EXCEPTION
    WHEN raise_exception THEN
      IF SQLERRM <> 'forced touch failure' THEN
        RAISE;
      END IF;
  END;
END;
$$;
RESET ROLE;

SELECT pg_temp.assert_true(
  (
    SELECT pipeline_status::text
    FROM sales.companies
    WHERE id = current_setting('test.company_id')::uuid
  ) = current_setting('test.previous_pipeline'),
  'company status must roll back when touch insert fails'
);
SELECT pg_temp.assert_true(
  (
    SELECT count(*)::text
    FROM sales.touchpoints
    WHERE company_id = current_setting('test.company_id')::uuid
  ) = current_setting('test.previous_touch_count'),
  'failed status transaction must not append a touch'
);

DROP TRIGGER security_reject_pipeline_touch ON sales.touchpoints;

SET LOCAL ROLE authenticated;
SELECT sales.gdpr_anonymize(current_setting('test.company_id')::uuid);
RESET ROLE;

SELECT pg_temp.assert_true(
  EXISTS (
    SELECT 1
    FROM sales.companies
    WHERE id = current_setting('test.company_id')::uuid
      AND name LIKE 'ANON-%'
      AND website IS NULL
      AND telefon IS NULL
      AND pipeline_status = 'disqualified'::sales.pipeline_status
  ),
  'GDPR path must remove company PII and close the pipeline'
);
SELECT pg_temp.assert_true(
  NOT EXISTS (
    SELECT 1
    FROM sales.people
    WHERE company_id = current_setting('test.company_id')::uuid
      AND (
        name <> 'Anonym'
        OR email IS NOT NULL
        OR telefon IS NOT NULL
        OR linkedin_url IS NOT NULL
      )
  ),
  'GDPR path must remove person PII'
);
SELECT pg_temp.assert_true(
  NOT EXISTS (
    SELECT 1
    FROM sales.touchpoints
    WHERE company_id = current_setting('test.company_id')::uuid
      AND notiz IS NOT NULL
  ),
  'GDPR path must redact append-only touch notes'
);

-- Fixture cleanup happens via ROLLBACK.
ROLLBACK;
