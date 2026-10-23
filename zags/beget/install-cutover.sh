#!/usr/bin/env bash
# Install the reviewed Russian ZAGS API/payment endpoint on the existing Beget stack.
# A fresh verified backup is created before any database or runtime change.
set -Eeuo pipefail
umask 077
fail(){ printf 'STOP (no ZAGS cutover): %s\n' "$*" >&2; exit 1; }
msg(){ printf 'ZAGS cutover: %s\n' "$*"; }
[[ "$(id -u)" == 0 ]] || fail 'Run as root in the Beget SSH shell'
[[ $# -eq 1 && "$1" =~ ^[a-f0-9]{40}$ ]] || fail 'Expected the reviewed 40-character Git commit SHA'
rev="$1"
for command in docker curl flock sha256sum; do command -v "$command" >/dev/null || fail "Missing $command"; done
[[ -d /root/backups ]] || fail 'Backups directory absent'
exec 9>/root/backups/zags-cutover-install.lock
flock -n 9 || fail 'Another ZAGS installation is running'

sql="SELECT CASE WHEN current_database()='postgres'
AND to_regclass('auth.users') IS NOT NULL
AND to_regclass('zags.couples') IS NOT NULL
AND to_regclass('zags.wishes') IS NOT NULL
AND to_regclass('zags.preview_testers') IS NOT NULL
AND to_regprocedure('public.zags_v2_action(text,jsonb)') IS NOT NULL
AND (SELECT count(*) FROM pg_tables WHERE schemaname='public' AND tablename LIKE 'tp_%')=14
THEN 'READY' ELSE 'STOP' END;"
ready="$(docker exec supabase-db psql -qAt -X -v ON_ERROR_STOP=1 -U postgres -d postgres -c "$sql")" || fail 'Read-only database preflight failed'
[[ "$ready" == READY ]] || fail 'Unexpected server state; no changes were made'

functions_container="$(docker ps --format '{{.Names}}' | while read -r name; do
  [[ "$(docker inspect -f '{{ index .Config.Labels "com.docker.compose.service" }}' "$name" 2>/dev/null || true)" == functions ]] && { printf '%s' "$name"; break; }
done)"
[[ -n "$functions_container" ]] || fail 'Could not find the existing Supabase functions service'
compose_dir="$(docker inspect -f '{{ index .Config.Labels "com.docker.compose.project.working_dir" }}' "$functions_container")"
[[ -n "$compose_dir" && -d "$compose_dir" ]] || fail 'Could not identify the Supabase Docker Compose directory'
(cd "$compose_dir" && docker compose config --quiet) || fail 'Could not validate the existing Supabase Compose configuration'
compose_services="$(cd "$compose_dir" && docker compose config --services)" || fail 'Could not read Supabase Compose services'
grep -qx functions <<<"$compose_services" || fail 'The existing Compose configuration has no functions service'
functions_source="$(docker inspect -f '{{range .Mounts}}{{if eq .Destination "/home/deno/functions"}}{{.Source}}{{end}}{{end}}' "$functions_container")"
[[ -n "$functions_source" && -d "$functions_source" && -w "$functions_source" ]] || fail 'Could not locate the writable Edge Functions source volume'
[[ ! -e "$functions_source/zags-payment" ]] || fail 'A zags-payment function already exists; refusing to replace it'

stamp="$(date -u +%Y%m%dT%H%M%SZ)"
backup="/root/backups/zags-cutover-preinstall-$stamp.dump"
stage="$(mktemp -d /root/backups/zags-cutover-stage.XXXXXX)"
trap 'rm -rf "$stage"' EXIT
msg 'Creating and verifying a fresh database backup...'
docker exec supabase-db pg_dump -Fc -U postgres -d postgres > "$backup" || fail 'Database backup failed'
[[ -s "$backup" ]] || fail 'Backup is empty'
docker exec -i supabase-db pg_restore --list < "$backup" >/dev/null || fail 'Backup validation failed'

raw="https://raw.githubusercontent.com/dimontattoo495-afk/ya-byl-zdes/$rev"
msg 'Downloading the reviewed, pinned SQL and payment endpoint...'
curl -fsSL --retry 2 --max-time 90 "$raw/zags/beget/008_zags_api_and_payments.sql" -o "$stage/008_zags_api_and_payments.sql" || fail 'Pinned SQL migration unavailable'
mkdir -p "$stage/zags-payment"
curl -fsSL --retry 2 --max-time 90 "$raw/zags/beget/functions/zags-payment/index.ts" -o "$stage/zags-payment/index.ts" || fail 'Pinned payment endpoint unavailable'
curl -fsSL --retry 2 --max-time 90 "$raw/zags/beget/functions/zags-payment/bank.mjs" -o "$stage/zags-payment/bank.mjs" || fail 'Pinned bank helper unavailable'
[[ -s "$stage/008_zags_api_and_payments.sql" && -s "$stage/zags-payment/index.ts" && -s "$stage/zags-payment/bank.mjs" ]] || fail 'A downloaded file is empty'
sha256sum "$stage/008_zags_api_and_payments.sql" "$stage/zags-payment/index.ts" "$stage/zags-payment/bank.mjs"

msg 'Applying the transaction-protected ZAGS API migration...'
docker exec -i supabase-db psql -X -q -v ON_ERROR_STOP=1 -U postgres -d postgres < "$stage/008_zags_api_and_payments.sql" || fail 'Database migration failed; keep the backup and stop for review'
cp -a "$stage/zags-payment" "$functions_source/zags-payment" || fail 'Could not install the isolated Edge Function'
msg 'Restarting only the existing Supabase functions service...'
(cd "$compose_dir" && docker compose restart functions --no-deps) || fail 'Edge Functions restart failed; keep the backup and stop for review'
function_http="$(curl -sS --max-time 15 -o "$stage/function-smoke.body" -w '%{http_code}' -X GET 'https://api.smoke-tattoo.ru/functions/v1/zags-payment' || true)"
[[ "$function_http" == 405 ]] || fail "The isolated payment function is not reachable without a user JWT (HTTP ${function_http:-none}); keep the backup and do not switch the website"

verify="SELECT CASE WHEN
to_regprocedure('public.zags_v2_action(text,jsonb)') IS NOT NULL
AND to_regprocedure('public.zags_news_status(uuid)') IS NOT NULL
AND to_regprocedure('public.zags_set_news_consent(uuid,boolean)') IS NOT NULL
AND to_regprocedure('public.zags_payment(text,jsonb)') IS NOT NULL
AND has_function_privilege('authenticated','public.zags_v2_action(text,jsonb)','EXECUTE')
AND NOT has_function_privilege('anon','public.zags_v2_action(text,jsonb)','EXECUTE')
AND has_function_privilege('anon','public.zags_public_news()','EXECUTE')
AND NOT has_function_privilege('anon','public.zags_payment(text,jsonb)','EXECUTE')
AND NOT has_function_privilege('authenticated','public.zags_payment(text,jsonb)','EXECUTE')
AND has_function_privilege('service_role','public.zags_payment(text,jsonb)','EXECUTE')
AND (SELECT count(*) FROM pg_tables WHERE schemaname='public' AND tablename LIKE 'tp_%')=14
THEN 'PASS' ELSE 'FAIL' END;"
result="$(docker exec supabase-db psql -qAt -X -v ON_ERROR_STOP=1 -U postgres -d postgres -c "$verify")" || fail 'Post-install verification query failed'
[[ "$result" == PASS ]] || fail 'Post-install verification failed; do not switch the website yet'

msg 'PASS: ZAGS API parity and isolated payment function installed; 14 TATTOO PRICE tables preserved.'
msg 'Payments remain unavailable until separate ZAGS bank and receipt settings are entered and reviewed.'
msg "Verified backup: $backup"
msg 'The public website has not been switched by this installer.'
