#!/usr/bin/env bash
# Installs the reviewed, additive ZAGS admin migration on the known Beget VPS.
# Does not create users, grant an admin, change shared Auth/SMTP, or touch payments.
set -Eeuo pipefail
umask 077
fail(){ printf 'STOP (no ZAGS admin install): %s\n' "$*" >&2; exit 1; }
msg(){ printf 'ZAGS admin: %s\n' "$*"; }
[[ "$(id -u)" == 0 ]] || fail 'Run only as root on the known Beget VPS'
[[ $# -eq 1 && "$1" =~ ^[a-f0-9]{40}$ ]] || fail 'Expected the reviewed 40-character Git commit SHA'
rev="$1"
for command in docker curl flock sha256sum; do command -v "$command" >/dev/null || fail "Missing $command"; done
[[ -d /root/backups ]] || fail 'Backups directory absent'
exec 9>/root/backups/zags-admin-install.lock
flock -n 9 || fail 'Another ZAGS admin install is running'

preflight="SELECT CASE WHEN current_database()='postgres'
AND to_regclass('auth.users') IS NOT NULL
AND to_regclass('zags.couples') IS NOT NULL
AND to_regclass('zags.wishes') IS NOT NULL
AND to_regclass('zags.preview_testers') IS NOT NULL
AND to_regclass('zags.admins') IS NULL
AND to_regprocedure('public.zags_admin_is_admin()') IS NULL
AND to_regprocedure('public.zags_admin_summary_v1()') IS NULL
AND to_regprocedure('public.zags_admin_couples_v1(text,integer,integer)') IS NULL
AND (SELECT count(*) FROM pg_tables WHERE schemaname='public' AND tablename LIKE 'tp_%')=14
THEN 'READY' ELSE 'STOP' END;"
ready="$(docker exec supabase-db psql -qAt -X -v ON_ERROR_STOP=1 -U postgres -d postgres -c "$preflight")" ||
  fail 'Read-only preflight failed'
[[ "$ready" == READY ]] || fail 'Unexpected server state; no changes were made'

stamp="$(date -u +%Y%m%dT%H%M%SZ)"
backup="/root/backups/zags-admin-preinstall-$stamp.dump"
mkdir -p /root/backups/zags-admin-install
sql_file="/root/backups/zags-admin-install/007-admin-$rev.sql"
msg 'Creating a fresh database backup before the additive migration...'
docker exec supabase-db pg_dump -Fc -U postgres -d postgres > "$backup" || fail 'Database backup failed'
[[ -s "$backup" ]] || fail 'Backup is empty'
docker exec -i supabase-db pg_restore --list < "$backup" >/dev/null || fail 'Backup validation failed'
msg 'Downloading the pinned migration...'
url="https://raw.githubusercontent.com/dimontattoo495-afk/ya-byl-zdes/$rev/zags/beget/007_admin_panel.sql"
curl --fail --show-error --silent --location --retry 2 --max-time 90 "$url" -o "$sql_file" || fail 'Pinned SQL migration unavailable'
[[ -s "$sql_file" ]] || fail 'Migration file is empty'
sha256sum "$sql_file"
msg 'Applying the transaction-protected migration...'
docker exec -i supabase-db psql -X -q -v ON_ERROR_STOP=1 -U postgres -d postgres < "$sql_file" ||
  fail 'Migration failed; keep the backup and stop for review'

verify="SELECT CASE WHEN
to_regclass('zags.admins') IS NOT NULL
AND (SELECT count(*) FROM zags.admins)=0
AND (SELECT count(*) FROM pg_tables WHERE schemaname='public' AND tablename LIKE 'tp_%')=14
AND NOT has_function_privilege('anon','public.zags_admin_is_admin()','EXECUTE')
AND NOT has_function_privilege('anon','public.zags_admin_summary_v1()','EXECUTE')
AND NOT has_function_privilege('anon','public.zags_admin_couples_v1(text,integer,integer)','EXECUTE')
AND has_function_privilege('authenticated','public.zags_admin_is_admin()','EXECUTE')
AND NOT has_table_privilege('authenticated','zags.admins','SELECT')
THEN 'PASS' ELSE 'FAIL' END;"
result="$(docker exec supabase-db psql -qAt -X -v ON_ERROR_STOP=1 -U postgres -d postgres -c "$verify")" ||
  fail 'Post-install verification query failed'
[[ "$result" == PASS ]] || fail 'Post-install checks failed; do not grant an admin'
msg 'PASS: migration installed; zero admins added; all 14 TATTOO PRICE tables preserved.'
msg "Backup saved at $backup"
msg 'Next: create/confirm the chosen admin account, then add only that confirmed email to zags.admins.'
msg 'Shared Auth, SMTP, public signup, and payments were not changed.'