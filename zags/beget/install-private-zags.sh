#!/usr/bin/env bash
# Installs EMPTY private virtual-ZAGS tables on the verified Beget VPS.
# Does NOT migrate user data or modify any TATTOO PRICE tables, payments or proxy.
set -Eeuo pipefail
umask 077
fail() { printf 'STOP (no deployment): %s\n' "$*" >&2; exit 1; }
msg() { printf 'ZAGS: %s\n' "$*"; }

[[ "$(id -u)" == 0 ]] || fail "Must run as root on Beget"
[[ $# -eq 1 && "$1" =~ ^[a-f0-9]{40}$ ]] || fail "Supply immutable Git commit SHA"
rev="$1"
for cmd in docker curl tar sha256sum awk df sed flock; do
  command -v "$cmd" >/dev/null || fail "Missing $cmd"
done
[[ -d /root/backups ]] || fail "No backups directory"
exec 9>/root/backups/zags-beget-install.lock
flock -n 9 || fail "Another installation is in progress"
[[ -d /root/supabase-project ]] || fail "Known Supabase directory missing"
[[ -s /root/backups/tattoo-price-2026-10-21.dump ]] || fail "Missing database backup"
[[ -s /root/backups/supabase-files-2026-10-21.tar.gz ]] || fail "Missing files backup"
[[ -s /root/backups/supabase-config-2026-10-21.tar.gz ]] || fail "Missing settings backup"
docker container inspect supabase-db >/dev/null || fail "Database container missing"
available_kb="$(df -Pk / | awk 'NR==2{print $4}')"
[[ "$available_kb" =~ ^[0-9]+$ && "$available_kb" -ge 1048576 ]] \
  || fail "At least 1GiB free disk space required"

msg "Checking PostgreSQL and the existing backups..."
docker exec supabase-db pg_isready -U postgres -d postgres >/dev/null \
  || fail "PostgreSQL not accepting connections"
docker exec -i supabase-db pg_restore -l \
  </root/backups/tattoo-price-2026-10-21.dump >/dev/null \
  || fail "PostgreSQL dump unreadable"
tar -tzf /root/backups/supabase-files-2026-10-21.tar.gz >/dev/null \
  || fail "Files archive unreadable"
tar -tzf /root/backups/supabase-config-2026-10-21.tar.gz >/dev/null \
  || fail "Settings archive unreadable"

# Exact observed Beget deployment only; abort if it was modified by others.
check_sql="SELECT CASE WHEN current_database()='postgres'
AND to_regclass('auth.users') IS NOT NULL
AND to_regprocedure('auth.uid()') IS NOT NULL
AND to_regnamespace('zags') IS NULL
AND to_regprocedure('public.zags_v2_action(text,jsonb)') IS NULL
AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon')
AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated')
AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role')
AND (SELECT count(*) FROM pg_tables WHERE schemaname='public' AND tablename LIKE 'tp_%')=14
THEN 'READY' ELSE 'STOP' END;"
readiness="$(docker exec supabase-db psql -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres -c "$check_sql")" \
  || fail "Database preflight failed"
[[ "$readiness" == READY ]] || fail "Unexpected live database or ZAGS already exists"

# Download ONLY files from a fixed Git SHA; no secret is transmitted.
mkdir -p /root/backups/zags-bootstrap
workdir="$(mktemp -d /root/backups/zags-bootstrap/install.XXXXXXXX)"
trap 'rm -rf "$workdir"' EXIT
base="https://raw.githubusercontent.com/dimontattoo495-afk/ya-byl-zdes/$rev/zags/beget"
for file in 001_isolated_schema.sql 002_onboarding_rpc.sql; do
  curl --fail --silent --show-error --location --retry 2 \
    --connect-timeout 20 --max-time 90 "$base/$file" -o "$workdir/$file" \
    || fail "Cannot download fixed-revision $file"
  [[ -s "$workdir/$file" ]] || fail "Empty SQL file: $file"
done
sha256sum "$workdir/001_isolated_schema.sql" "$workdir/002_onboarding_rpc.sql" \
  | sed "s@$workdir/@@"

# Both statements are executed in ONE transaction; errors cause rollback.
msg "Creating empty private schema and blocked-payment onboarding RPC..."
{
  printf 'BEGIN;\n'
  for file in 001_isolated_schema.sql 002_onboarding_rpc.sql; do
    sed -e '/^BEGIN;$/d' -e '/^COMMIT;$/d' "$workdir/$file"
  done
  printf '\nCOMMIT;\n'
} | docker exec -i supabase-db psql -X -v ON_ERROR_STOP=1 \
      -U postgres -d postgres -q \
  || fail "Database transaction failed; no live payment was enabled"

msg "Verifying schema, private permissions and existing TATTOO PRICE table count..."
verify_sql="SELECT CASE
WHEN to_regclass('zags.couples') IS NOT NULL
AND to_regclass('zags.wishes') IS NOT NULL
AND to_regprocedure('public.zags_v2_action(text,jsonb)') IS NOT NULL
AND (SELECT count(*) FROM pg_tables WHERE schemaname='public' AND tablename LIKE 'tp_%')=14
AND (SELECT count(*) FROM zags.couples)=0
AND (SELECT count(*) FROM zags.wishes)=0
AND NOT has_table_privilege('authenticated','zags.couples','SELECT')
AND NOT has_schema_privilege('anon','zags','USAGE')
AND NOT has_schema_privilege('authenticated','zags','USAGE')
THEN 'PASS' ELSE 'FAIL' END;"
result="$(docker exec supabase-db psql -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres -c "$verify_sql")" \
  || fail "Could not verify installation"
[[ "$result" == PASS ]] || fail "Post-install verification mismatch: STOP"
msg "PASS: the isolated ZAGS schema was created; 14 TP tables remain present."
msg "Real payments, public ZAGS user traffic and cloud user-data import remain DISABLED."
