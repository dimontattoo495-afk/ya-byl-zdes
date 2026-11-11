#!/usr/bin/env bash
# Grant access to a SECOND confirmed account in the same local Beget Auth.
# Run as root on the Beget VPS after the owner and phase-2 are already approved.
# Requires a different, existing, confirmed, non-banned account; no public signup.
set -Eeuo pipefail
umask 077
fail(){ printf 'STOP: %s\n' "$*" >&2; exit 1; }
[[ "$(id -u)" == 0 ]] || fail "Must run inside Beget SSH as root"
[[ $# -eq 1 && "$1" =~ ^[a-f0-9]{40}$ ]] || fail "Pass immutable reviewed Git SHA"
rev="$1"
[[ -s /root/backups/tattoo-price-2026-10-21.dump ]] || fail "Prior PostgreSQL backup missing"
for tool in curl docker flock; do command -v "$tool" >/dev/null || fail "$tool missing"; done
exec 9>/root/backups/zags-beget-beta.lock
flock -n 9 || fail "Other ZAGS beta changes in progress"
ready="$(docker exec supabase-db psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres -c \
 "SELECT CASE WHEN to_regclass('zags.preview_testers') IS NOT NULL
   AND (SELECT count(*) FROM zags.preview_testers WHERE enabled AND expires_at>now())=1
   AND (SELECT count(*) FROM pg_tables WHERE schemaname='public' AND tablename LIKE 'tp_%')=14
   THEN 'READY' ELSE 'STOP' END;")" || fail "Read-only preflight failed"
[[ "$ready" == READY ]] || fail "Exactly one active beta tester and 14 TP tables required"

printf 'Email of a DIFFERENT CONFIRMED Beget Auth account (entered only here): '
IFS= read -r partner_email
[[ "$partner_email" =~ ^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$ ]] ||
  fail "Invalid email format"
mkdir -p /root/backups/zags-bootstrap
sql="/root/backups/zags-bootstrap/add-partner-$rev.sql"
curl -fsSL --max-time 90 --retry 2 \
  "https://raw.githubusercontent.com/dimontattoo495-afk/ya-byl-zdes/$rev/zags/beget/006_approve_second_tester.sql" \
  -o "$sql" || fail "Download of pinned migration failed"
[[ -s "$sql" ]] || fail "Downloaded SQL empty"
docker exec -i supabase-db psql -X -q -v ON_ERROR_STOP=1 \
  -v "partner_email=$partner_email" -U postgres -d postgres <"$sql" ||
  fail "Second account not found or already granted; no partial changes applied"
unset partner_email
echo 'PASS: independent second test account is allowed for four hours. Real payments remain OFF.'
