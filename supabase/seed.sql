-- Staging / local seed: anonymized fixtures (no production PII).
-- Applied by `supabase db reset` after migrations.

-- Auth fixtures (local/staging only)
--
-- Die Token-Spalten müssen leere Strings sein, nicht NULL. GoTrue liest sie mit
-- einem non-nullable String-Scan; bleiben sie NULL, scheitert jeder Login mit
-- "Database error querying schema" (500) — die Fixtures waren damit für eine
-- echte Anmeldung unbrauchbar.
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
  updated_at,
  confirmation_token,
  recovery_token,
  email_change,
  email_change_token_new,
  email_change_token_current,
  phone_change,
  phone_change_token,
  reauthentication_token
)
VALUES
  (
    '11111111-1111-4111-8111-111111111111',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'crm-allowlisted@staging.invalid',
    crypt('staging-allowlisted', gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb,
    now(),
    now(),
    '', '', '', '', '', '', '', ''
  ),
  (
    '55555555-5555-4555-8555-555555555555',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'crm-non-app@staging.invalid',
    crypt('staging-non-app', gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb,
    now(),
    now(),
    '', '', '', '', '', '', '', ''
  )
ON CONFLICT (id) DO NOTHING;

INSERT INTO sales.app_users (user_id, email, notiz)
VALUES (
  '11111111-1111-4111-8111-111111111111',
  'crm-allowlisted@staging.invalid',
  'Staging allowlisted test user'
)
ON CONFLICT (user_id) DO UPDATE
SET email = EXCLUDED.email, notiz = EXCLUDED.notiz;

INSERT INTO sales.ref_stadt_bundesland (stadt, bundesland, region) VALUES
  ('mainz', 'Rheinland-Pfalz', 'RLP'),
  ('wiesbaden', 'Hessen', 'Rhein-Main'),
  ('koeln', 'Nordrhein-Westfalen', 'NRW')
ON CONFLICT (stadt) DO NOTHING;

INSERT INTO sales.companies (
  id, name, stadt, website, pipeline_status, relationship, crm_system, anfragen_pro_woche
) VALUES (
  '22222222-2222-4222-8222-222222222222',
  'Staging HV Alpha GmbH',
  'Mainz',
  'https://staging-alpha.invalid',
  'neu',
  'Prospect',
  'unbekannt',
  10
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO sales.people (id, company_id, name, email, ist_entscheider)
VALUES (
  '33333333-3333-4333-8333-333333333333',
  '22222222-2222-4222-8222-222222222222',
  'Staging Entscheider',
  'entscheider@staging-alpha.invalid',
  true
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO sales.touchpoints (company_id, person_id, kanal, ergebnis, notiz, naechster_touch)
SELECT
  '22222222-2222-4222-8222-222222222222',
  '33333333-3333-4333-8333-333333333333',
  'call',
  'nicht_erreicht',
  'Staging seed touch',
  CURRENT_DATE
WHERE NOT EXISTS (
  SELECT 1 FROM sales.touchpoints
  WHERE company_id = '22222222-2222-4222-8222-222222222222'
    AND notiz = 'Staging seed touch'
);

INSERT INTO sales.companies (
  id, name, stadt, pipeline_status, relationship
) VALUES (
  '44444444-4444-4444-8444-444444444444',
  'Staging Kunde Beta GmbH',
  'Wiesbaden',
  'kunde',
  'Kunde'
)
ON CONFLICT (id) DO NOTHING;
