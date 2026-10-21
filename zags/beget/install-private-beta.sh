#!/usr/bin/env bash
# PHASE 2 — opt-in private beta gate. Empty tester allowlist by default.
# No public enrollment, no payments, no DNS/Caddy/TP/Auth configuration changes.
set -Eeuo pipefail
umask 077
fail(){ printf 'STOP (no phase-2 rollout): %s\n' "$*" >&2; exit 1; }
msg(){ printf 'ZAGS beta: %s\n' "$*"; }
[[ "$(id -u)" == 0 ]] || fail "Run only as root on the known Beget VPS"
[[ $# -eq 1 && "$1" =~ ^[a-f0-9]{40}$ ]] || fail "Expected fixed 40-character Git SHA"
rev="$1"
for command in docker curl flock; do command -v "$command" >/dev/null || fail "Missing $command"; done
[[ -d /root/backups ]] || fail "Backups directory absent"
exec 9>/root/backups/zags-beget-beta.lock
flock -n 9 || fail "Another beta setup process is running"
[[ -s /root/backups/tattoo-price-2026-10-21.dump ]] || fail "Existing database backup missing"
[[ -s /root/backups/supabase-files-2026-10-21.tar.gz ]] || fail "Existing files backup missing"
[[ -s /root/backups/supabase-config-2026-10-21.tar.gz ]] || fail "Existing configuration backup missing"
msg "Checking original phase 1 and read-only guard..."
sql="SELECT CASE WHEN current_database()='postgres'
AND to_regclass('auth.users') IS NOT NULL
AND to_regclass('zags.couples') IS NOT NULL
AND to_regclass('zags.wishes') IS NOT NULL
AND to_regclass('zags.preview_testers') IS NULL
AND to_regprocedure('public.zags_v2_action(text,jsonb)') IS NOT NULL
AND (SELECT count(*) FROM zags.couples)=0
AND (SELECT count(*) FROM zags.wishes)=0
AND (SELECT count(*) FROM pg_tables WHERE schemaname='public' AND tablename LIKE 'tp_%')=14
AND NOT has_function_privilege('authenticated','public.zags_v2_action(text,jsonb)','EXECUTE')
THEN 'READY' ELSE 'STOP' END;"
ready="$(docker exec supabase-db psql -qAt -X -v ON_ERROR_STOP=1 -U postgres -d postgres -c "$sql")" ||
  fail "Database check could not complete"
[[ "$ready" == READY ]] || fail "Unexpected existing data/roles; will not modify"
mkdir -p /root/backups/zags-bootstrap
path="/root/backups/zags-bootstrap/private-beta-$rev.sql"
url="https://raw.githubusercontent.com/dimontattoo495-afk/ya-byl-zdes/$rev/zags/beget/003_private_beta_allowlist.sql"
msg "Downloading reviewed, immutable phase-2 SQL..."
curl --fail --show-error --silent --location --retry 2 --max-time 90 "$url" -o "$path" ||
  fail "Pinned beta migration unavailable"
[[ -s "$path" ]] || fail "SQL file empty"
msg "Applying SQL atomically; zero test accounts are enabled..."
docker exec -i supabase-db psql -X -q -v ON_ERROR_STOP=1 -U postgres -d postgres <"$path" ||
  fail "SQL failed; stop, do not retry without review"
sql="SELECT CASE
WHEN (SELECT count(*) FROM zags.preview_testers)=0
AND (SELECT count(*) FROM zags.couples)=0
AND (SELECT count(*) FROM zags.wishes)=0
AND (SELECT count(*) FROM pg_tables WHERE schemaname='public' AND tablename LIKE 'tp_%')=14
AND NOT has_function_privilege('anon','public.zags_v2_action(text,jsonb)','EXECUTE')
AND has_function_privilege('authenticated','public.zags_v2_action(text,jsonb)','EXECUTE')
AND NOT has_table_privilege('authenticated','zags.preview_testers','SELECT')
AND NOT has_schema_privilege('authenticated','zags','USAGE')
THEN 'PASS' ELSE 'FAIL' END;"
out="$(docker exec supabase-db psql -qAt -X -v ON_ERROR_STOP=1 -U postgres -d postgres -c "$sql")" ||
  fail "Verification query failed"
[[ "$out" == PASS ]] || fail "Unexpected security state after installation"
msg "PASS: beta gate installed; ZERO users enabled; TATTOO PRICE tables unchanged."
msg "Public ZAGS site/payment stays disabled; no OTP/CORS or data migration performed."
