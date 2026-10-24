#!/usr/bin/env bash
# Safely repair one ZAGS T-Bank order that the bank confirms does not exist.
set -Eeuo pipefail
umask 077

fail(){ printf 'STOP (no payment created): %s\n' "$*" >&2; exit 1; }
msg(){ printf 'ZAGS recovery: %s\n' "$*"; }

[[ "$(id -u)" == 0 ]] || fail 'Run this from the Beget root SSH shell'
[[ $# -eq 2 && "$1" =~ ^[a-f0-9]{40}$ ]] || fail 'Expected reviewed commit SHA and a T-Bank OrderId or latest'
rev="$1"
order_id="$2"
if [[ "$order_id" != latest && ! "$order_id" =~ ^[0-9a-fA-F-]{36}$ ]]; then fail 'OrderId format is invalid'; fi
for command in docker curl openssl python3 update-ca-certificates; do command -v "$command" >/dev/null || fail "Missing $command"; done

functions_container="$(docker ps --format '{{.Names}}' | while read -r name; do
  [[ "$(docker inspect -f '{{ index .Config.Labels "com.docker.compose.service" }}' "$name" 2>/dev/null || true)" == functions ]] && { printf '%s' "$name"; break; }
done)"
[[ -n "$functions_container" ]] || fail 'Could not find the Supabase functions service'
compose_dir="$(docker inspect -f '{{ index .Config.Labels "com.docker.compose.project.working_dir" }}' "$functions_container")"
functions_source="$(docker inspect -f '{{range .Mounts}}{{if eq .Destination "/home/deno/functions"}}{{.Source}}{{end}}{{end}}' "$functions_container")"
[[ -n "$compose_dir" && -d "$compose_dir" ]] || fail 'Could not locate the Supabase Compose project'
[[ -n "$functions_source" && -d "$functions_source/zags-payment" ]] || fail 'Could not locate the mounted ZAGS payment function'
if [[ "$order_id" == latest ]]; then
  order_id="$(docker exec supabase-db psql -qAt -X -v ON_ERROR_STOP=1 -U postgres -d postgres -c "SELECT order_id::text FROM zags.couples WHERE payment_status='pending' AND order_id IS NOT NULL AND payment_id IS NULL AND payment_url IS NULL ORDER BY payment_created_at DESC NULLS LAST LIMIT 1;")" || fail 'Could not find the latest pending ZAGS order'
  [[ "$order_id" =~ ^[0-9a-fA-F-]{36}$ ]] || fail 'No pending reservation without saved payment details was found'
  msg "Selected the latest pending order: $order_id"
fi
(cd "$compose_dir" && docker compose config --quiet) || fail 'Supabase Compose configuration did not validate'

tmp="$(mktemp -d /root/zags-tbank-recovery.XXXXXX)"
backup_dir=/root/backups
mkdir -p "$backup_dir"
trap 'rm -rf "$tmp"' EXIT

msg 'Downloading the two official Russian Trusted CA certificates...'
curl -fsSL --retry 2 --max-time 60 https://gu-st.ru/content/lending/russian_trusted_root_ca_pem.crt -o "$tmp/russian_trusted_root_ca.crt" || fail 'Could not download the official root CA'
curl -fsSL --retry 2 --max-time 60 https://gu-st.ru/content/lending/russian_trusted_sub_ca_pem.crt -o "$tmp/russian_trusted_sub_ca.crt" || fail 'Could not download the official intermediate CA'
root_subject="$(openssl x509 -in "$tmp/russian_trusted_root_ca.crt" -noout -subject)" || fail 'The root CA file is not a valid PEM certificate'
sub_subject="$(openssl x509 -in "$tmp/russian_trusted_sub_ca.crt" -noout -subject)" || fail 'The intermediate CA file is not a valid PEM certificate'
[[ "$root_subject" == *'Russian Trusted Root CA'* ]] || fail 'Downloaded root certificate subject did not match the expected CA'
[[ "$sub_subject" == *'Russian Trusted Sub CA'* ]] || fail 'Downloaded intermediate certificate subject did not match the expected CA'
openssl verify -CAfile "$tmp/russian_trusted_root_ca.crt" "$tmp/russian_trusted_sub_ca.crt" || fail 'The official certificate chain did not verify'
cat "$tmp/russian_trusted_root_ca.crt" "$tmp/russian_trusted_sub_ca.crt" > "$tmp/tbank-ca.pem"
install -m 0644 "$tmp/russian_trusted_root_ca.crt" /usr/local/share/ca-certificates/russian_trusted_root_ca.crt
install -m 0644 "$tmp/russian_trusted_sub_ca.crt" /usr/local/share/ca-certificates/russian_trusted_sub_ca.crt
update-ca-certificates

row="$(docker exec supabase-db psql -qAt -X -v ON_ERROR_STOP=1 -U postgres -d postgres -F '|' -c "SELECT id::text,payment_status,coalesce(payment_id,''),coalesce(payment_url,''),(payment_created_at IS NOT NULL)::text FROM zags.couples WHERE order_id='${order_id}'::uuid;")" || fail 'Could not read the exact ZAGS order row'
[[ -n "$row" ]] || fail 'OrderId is absent from ZAGS database; no changes made'
IFS='|' read -r couple_id status payment_id payment_url has_created_at <<<"$row"
[[ "$status" == pending && -z "$payment_id" && -z "$payment_url" && "$has_created_at" == true ]] || fail 'Database row is not the expected unpaid reservation; no changes made'

msg 'Checking the order with T-Bank before changing the database...'
python3 - "$order_id" "$functions_container" <<'PY'
import hashlib, json, subprocess, sys, urllib.request, urllib.error
order_id=sys.argv[1]
container=sys.argv[2]
raw=subprocess.check_output(['docker','inspect','--format','{{range .Config.Env}}{{println .}}{{end}}',container],text=True,stderr=subprocess.DEVNULL)
env={line.split('=',1)[0]:line.split('=',1)[1] for line in raw.splitlines() if '=' in line}
terminal=env.get('ZAGS_TBANK_TERMINAL_KEY',''); password=env.get('ZAGS_TBANK_PASSWORD','')
if not terminal or not password:
    print('STOP: T-Bank credentials are missing from Edge Functions; no database changes made'); sys.exit(2)
fields={'TerminalKey':terminal,'OrderId':order_id,'Password':password}
token=hashlib.sha256(''.join(fields[k] for k in sorted(fields)).encode()).hexdigest()
body=json.dumps({'TerminalKey':terminal,'OrderId':order_id,'Token':token}).encode()
request=urllib.request.Request('https://securepay.tinkoff.ru/v2/CheckOrder',data=body,headers={'Content-Type':'application/json'},method='POST')
try:
    with urllib.request.urlopen(request,timeout=20) as response: data=json.loads(response.read().decode())
except Exception as error:
    print('STOP: could not securely verify the order with T-Bank:',type(error).__name__,str(error)[:180]); sys.exit(2)
payments=data.get('Payments') or []
print(json.dumps({'orderId':order_id,'success':data.get('Success'),'errorCode':str(data.get('ErrorCode','')),'message':str(data.get('Message','')),'paymentsCount':len(payments)},ensure_ascii=False))
if str(data.get('ErrorCode',''))!='335' or payments:
    print('STOP: bank did not confirm an absent order with zero payments; database unchanged'); sys.exit(3)
PY

stamp="$(date -u +%Y%m%dT%H%M%SZ)"
db_backup="$backup_dir/zags-before-tbank-order-recovery-$stamp.dump"
msg 'Creating and verifying a database backup...'
docker exec supabase-db pg_dump -Fc -U postgres -d postgres > "$db_backup" || fail 'Database backup failed'
[[ -s "$db_backup" ]] || fail 'Database backup is empty'
docker exec -i supabase-db pg_restore --list < "$db_backup" >/dev/null || fail 'Database backup verification failed'

raw="https://raw.githubusercontent.com/dimontattoo495-afk/ya-byl-zdes/$rev"
curl -fsSL --retry 2 --max-time 60 "$raw/zags/beget/functions/zags-payment/index.ts" -o "$tmp/index.ts" || fail 'Could not download the reviewed payment function'
grep -q 'Deno.createHttpClient' "$tmp/index.ts" || fail 'The pinned function does not contain the verified CA client fix'
python3 - "$tmp/index.ts" "$tmp/tbank-ca.pem" "$tmp/index.rendered.ts" <<'PY'
import json, re, sys
source_path, ca_path, output_path = sys.argv[1:]
source = open(source_path, encoding='utf-8').read()
pem = open(ca_path, encoding='ascii').read()
certs = re.findall(r'-----BEGIN CERTIFICATE-----[\\s\\S]+?-----END CERTIFICATE-----', pem)
marker = '"__TBANK_CA_CERTS_JSON__"'
if len(certs) < 2 or source.count(marker) != 1:
    raise SystemExit('STOP: expected a source marker and two CA certificates')
source = source.replace(marker, json.dumps(json.dumps(certs)))
open(output_path, 'w', encoding='utf-8').write(source)
PY
grep -Fq '"__TBANK_CA_CERTS_JSON__"' "$tmp/index.rendered.ts" && fail 'CA bundle was not embedded into the payment function'
cp -a "$functions_source/zags-payment/index.ts" "$backup_dir/zags-payment-index-before-tbank-ca-$stamp.ts"
cp -a "$functions_source/zags-payment/tbank-ca.pem" "$backup_dir/zags-payment-ca-before-tbank-ca-$stamp.pem" 2>/dev/null || true

install -m 0644 "$tmp/tbank-ca.pem" "$functions_source/zags-payment/tbank-ca.pem"
install -m 0644 "$tmp/index.rendered.ts" "$functions_source/zags-payment/index.ts"

msg 'Restarting only the Supabase Edge Functions service to load the official CA bundle...'
(cd "$compose_dir" && docker compose restart functions --no-deps) || fail 'Edge Functions restart failed; backup is available at '"$db_backup"

msg 'Clearing only the verified stale reservation; the order remains unpaid.'
reset="$(docker exec supabase-db psql -qAt -X -v ON_ERROR_STOP=1 -U postgres -d postgres -c "UPDATE zags.couples SET payment_status='unpaid',order_id=NULL,payment_created_at=NULL,payment_id=NULL,payment_url=NULL WHERE order_id='${order_id}'::uuid AND payment_status='pending' AND payment_id IS NULL AND payment_url IS NULL RETURNING id::text;")" || fail 'Could not safely reset the reservation; backup is at '"$db_backup"
[[ "$reset" == "$couple_id" ]] || fail 'The reservation changed during recovery; stop and review the database backup'

curl -sS --max-time 12 -o /dev/null -w 'T-Bank TLS check: HTTP %{http_code}\n' https://securepay.tinkoff.ru/v2/CheckOrder || fail 'Host TLS check failed after certificate installation'
msg 'PASS: T-Bank confirmed no old payment, official CA installed on the host and in the ZAGS Edge Function, and the one stale reservation is now unpaid/retryable.'
msg 'No payment was initiated. Database backup: '"$db_backup"
