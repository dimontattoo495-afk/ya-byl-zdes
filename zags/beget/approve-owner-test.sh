#!/usr/bin/env bash
# Invite ONLY an existing verified Beget Auth account to a four-hour PRIVATE ZAGS beta.
# Operator enters their own account email LOCALLY, not in ChatGPT or GitHub.
# No other project, account, billing or Auth settings are changed.
set -Eeuo pipefail
umask 077
fail(){ printf 'STOP: %s\n' "$*" >&2; exit 1; }
[[ "$(id -u)" == 0 ]] || fail "Run only as root on the verified Beget VPS"
[[ $# -eq 1 && "$1" =~ ^[a-f0-9]{40}$ ]] || fail "Pass reviewed immutable Git commit SHA"
rev="$1"
[[ -s /root/backups/tattoo-price-2026-10-21.dump ]] || fail "Local verified PostgreSQL dump absent"
[[ -s /root/backups/supabase-config-2026-10-21.tar.gz ]] || fail "Configuration archive absent"
command -v curl >/dev/null || fail "curl missing"
command -v docker >/dev/null || fail "docker missing"

db_state="$(docker exec supabase-db psql -qAt -X -v ON_ERROR_STOP=1 -U postgres -d postgres -c \
 "SELECT CASE WHEN to_regclass('zags.preview_testers') IS NOT NULL
  AND to_regprocedure('public.zags_v2_action(text,jsonb)') IS NOT NULL
  AND (SELECT count(*) FROM zags.preview_testers WHERE enabled AND expires_at>now())=0
  AND (SELECT count(*) FROM pg_tables WHERE schemaname='public' AND tablename LIKE 'tp_%')=14
  THEN 'READY' ELSE 'STOP' END;")" || fail "Beget database state could not be checked"
[[ "$db_state" == READY ]] || fail "Preview already enabled, or expected base state changed"

printf 'Existing CONFIRMED account email on local Beget Auth (never sent to chat): '
IFS= read -r owner_email
[[ "$owner_email" =~ ^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$ ]] ||
  fail "Invalid email format"
mkdir -p /root/backups/zags-bootstrap
path="/root/backups/zags-bootstrap/approve-owner-$rev.sql"
curl --fail --show-error --silent --location --max-time 60 --retry 2 \
 "https://raw.githubusercontent.com/dimontattoo495-afk/ya-byl-zdes/$rev/zags/beget/005_approve_existing_owner.sql" \
 -o "$path" || fail "Cannot download approved SQL"
[[ -s "$path" ]] || fail "Downloaded SQL is empty"

# psql -v produces properly quoted :'owner_email' on server, no shell SQL concatenation.
docker exec -i supabase-db psql -q -X -v ON_ERROR_STOP=1 \
  -v "owner_email=$owner_email" -U postgres -d postgres <"$path" ||
  fail "Account not found/confirmed or permission check failed; no beta user enabled"
unset owner_email
echo 'PASS: exactly one existing confirmed account permitted to test ZAGS for four hours.'
echo 'Payment and public access are still disabled. NO new account was created.'
