#!/usr/bin/env bash
# Read-only readiness audit of the LOCAL Beget Supabase after private beta install.
# No secret values, account emails, JWTs, DB rows, passwords or file contents printed.
set -Eeuo pipefail
echo "=== VIRTUAL ZAGS / SHARED SUPABASE HEALTH (READ ONLY) ==="
docker exec supabase-db psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres -c "
SELECT 'auth.users present: ' || (to_regclass('auth.users') IS NOT NULL)::text
UNION ALL SELECT 'zags.couples present: ' || (to_regclass('zags.couples') IS NOT NULL)::text
UNION ALL SELECT 'zags.wishes present: ' || (to_regclass('zags.wishes') IS NOT NULL)::text
UNION ALL SELECT 'zags.preview_testers present: ' || (to_regclass('zags.preview_testers') IS NOT NULL)::text
UNION ALL SELECT 'ZAGS RPC present: ' || (to_regprocedure('public.zags_v2_action(text,jsonb)') IS NOT NULL)::text
UNION ALL SELECT 'anonymous RPC blocked: ' ||
  (NOT has_function_privilege('anon','public.zags_v2_action(text,jsonb)','EXECUTE'))::text
UNION ALL SELECT 'authenticated RPC privilege: ' ||
  has_function_privilege('authenticated','public.zags_v2_action(text,jsonb)','EXECUTE')::text
UNION ALL SELECT 'direct authenticated table reading blocked: ' ||
  (NOT has_table_privilege('authenticated','zags.couples','SELECT'))::text
UNION ALL SELECT 'approved test users: ' || count(*)::text
  FROM zags.preview_testers WHERE enabled IS TRUE AND expires_at>now()
UNION ALL SELECT 'TATTOO PRICE tables: ' || count(*)::text
  FROM pg_tables WHERE schemaname='public' AND tablename LIKE 'tp_%';
"
echo "=== RUNNING SUPABASE SERVICES ==="
for name in supabase-db supabase-auth supabase-caddy supabase-edge-functions; do
 if docker container inspect "$name" >/dev/null 2>&1; then
  docker inspect --format '{{.Name}}: {{.State.Status}}' "$name"
 else
  echo "$name: not found"
 fi
done
echo "=== EMAIL AUTH: SETTINGS PRESENCE ONLY (NO SECRETS) ==="
docker inspect --format '{{range .Config.Env}}{{println .}}{{end}}' supabase-auth |
awk -F= '
  /^GOTRUE_SMTP_HOST=/ { smtp=($2!="" ? "configured" : "empty") }
  /^GOTRUE_MAILER_AUTOCONFIRM=/ { confirm=($2=="true" ? "true" : "false") }
  /^GOTRUE_DISABLE_SIGNUP=/ { signup=($2=="true" ? "true" : "false") }
  /^GOTRUE_SITE_URL=/ { site=($2!="" ? "configured" : "empty") }
  END {
    print "SMTP_HOST=" (smtp=="" ? "not declared" : smtp);
    print "MAILER_AUTOCONFIRM=" (confirm=="" ? "unknown" : confirm);
    print "DISABLE_SIGNUP=" (signup=="" ? "unknown" : signup);
    print "SITE_URL=" (site=="" ? "unknown" : site);
    print "The presence of SMTP settings does NOT prove that OTP emails are delivered."
  }'
echo "=== API CROSS-ORIGIN PREFLIGHT (METADATA ONLY) ==="
if command -v curl >/dev/null 2>&1; then
 if h="$(curl -sS -D - -o /dev/null --connect-timeout 6 --max-time 12 \
   -X OPTIONS \
   -H 'Origin: https://yabylzdes.ru' \
   -H 'Access-Control-Request-Method: POST' \
   -H 'Access-Control-Request-Headers: apikey,authorization,content-type' \
   'https://api.smoke-tattoo.ru/rest/v1/rpc/zags_v2_action' 2>/dev/null)"; then
   printf '%s\n' "$h" | awk '
     BEGIN{IGNORECASE=1}
     /^HTTP\// { status=$0; sub(/\r$/,"",status) }
     tolower($0)~/^access-control-allow-origin:/ { origin=$0; sub(/\r$/,"",origin) }
     tolower($0)~/^access-control-allow-methods:/ { methods="present" }
     tolower($0)~/^access-control-allow-headers:/ { headers="present" }
     END {
       print "OPTIONS=" (status=="" ? "unknown" : status);
       print "ACAO=" (origin=="" ? "not provided" : origin);
       print "ACAM=" (methods=="" ? "not provided" : methods);
       print "ACAH=" (headers=="" ? "not provided" : headers)
     }'
 else
   echo "External API OPTIONS request unavailable; no changes performed."
 fi
else
 echo "curl not installed; cross-origin request not attempted"
fi
echo "READ-ONLY AUDIT COMPLETE. Nothing has been installed or changed."
