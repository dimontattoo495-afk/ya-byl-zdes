#!/usr/bin/env bash
# Read-only local SUPABASE Auth compatibility scan for upcoming ZAGS API migration.
# NEVER dumps auth environment values, tokens, emails, data, SMTP secrets or .env files.
set -Eeuo pipefail
echo "=== LOCAL ZAGS SCHEMA AND RPC READINESS ==="
docker exec supabase-db psql -X -qAt -U postgres -d postgres -c "
SELECT 'auth.users present: ' || (to_regclass('auth.users') IS NOT NULL)::text
UNION ALL SELECT 'zags.couples present: ' || (to_regclass('zags.couples') IS NOT NULL)::text
UNION ALL SELECT 'zags.wishes present: ' || (to_regclass('zags.wishes') IS NOT NULL)::text
UNION ALL SELECT 'private RPC present: ' || (to_regprocedure('public.zags_v2_action(text,jsonb)') IS NOT NULL)::text
UNION ALL SELECT 'public invocation denied: ' || (NOT has_function_privilege('authenticated','public.zags_v2_action(text,jsonb)','EXECUTE'))::text
UNION ALL SELECT 'TP table count: ' || count(*)::text FROM pg_tables
 WHERE schemaname='public' AND tablename LIKE 'tp_%';
"
echo "=== AUTH AND API COMPONENTS ==="
for name in supabase-auth supabase-caddy supabase-edge-functions; do
 if docker container inspect "$name" >/dev/null 2>&1; then
  docker inspect --format '{{.Name}}: {{.State.Status}}' "$name"
 else
  echo "$name: container not present"
 fi
done
echo "=== EMAIL OTP CONFIGURATION (PRESENCE ONLY, NO SECRET VALUES) ==="
# docker inspect exposes secrets to root locally; command only emits the yes/no presence.
docker inspect --format '{{range .Config.Env}}{{println .}}{{end}}' supabase-auth |
awk -F= '
  /^GOTRUE_SMTP_HOST=/ { smtp=($2!="" ? "configured" : "empty") }
  /^GOTRUE_MAILER_AUTOCONFIRM=/ { confirm=($2=="true" ? "true" : "false") }
  END {
    print "SMTP_HOST=" (smtp=="" ? "not provided in auth env" : smtp);
    print "MAILER_AUTOCONFIRM=" (confirm=="" ? "unknown" : confirm);
    print "INFO: This does not verify email delivery or prove a safe auth migration."
  }'
echo "DONE: no data or settings have been changed."
