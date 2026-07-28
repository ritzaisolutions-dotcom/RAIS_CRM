-- Expose sales schema usage + RLS for authenticated CRM access (Option A).
-- Applied remotely via Supabase MCP as sales_auth_rls_grants.

GRANT USAGE ON SCHEMA sales TO anon, authenticated, service_role;

GRANT SELECT ON ALL TABLES IN SCHEMA sales TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA sales TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA sales TO service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA sales TO authenticated, service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA sales TO authenticated, service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA sales
  GRANT SELECT ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA sales
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA sales
  GRANT ALL ON TABLES TO service_role;

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

-- PostgREST: include sales in exposed schemas (also confirm in Dashboard → Settings → API).
ALTER ROLE authenticator SET pgrst.db_schemas = 'public, storage, graphql_public, sales';
NOTIFY pgrst, 'reload config';
NOTIFY pgrst, 'reload schema';
