-- VIRTUAL ZAGS ON BEGET — READ-ONLY PREFLIGHT
-- No CREATE, ALTER, INSERT, UPDATE, DELETE, DROP, or system commands.
-- Intended for DBA review on the self-hosted Beget PostgreSQL, never run on cloud Supabase.
SELECT 'current_database' AS check_name, current_database() AS value
UNION ALL SELECT 'server_version', current_setting('server_version')
UNION ALL SELECT 'auth_users_exists', (to_regclass('auth.users') IS NOT NULL)::text
UNION ALL SELECT 'public_tp_table_count', count(*)::text
  FROM pg_tables WHERE schemaname='public' AND tablename LIKE 'tp_%'
UNION ALL SELECT 'public_zags_table_count', count(*)::text
  FROM pg_tables WHERE schemaname='public' AND tablename LIKE 'zags_%'
UNION ALL SELECT 'isolated_zags_schema_exists', (to_regnamespace('zags') IS NOT NULL)::text
UNION ALL SELECT 'postgres_database_size', pg_size_pretty(pg_database_size(current_database()))
UNION ALL SELECT 'jwt_authenticated_role_exists',
  EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated')::text
UNION ALL SELECT 'service_role_exists',
  EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role')::text
ORDER BY check_name;
