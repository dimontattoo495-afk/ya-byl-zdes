#!/usr/bin/env bash
# Read-only T-Bank status check for a stuck ZAGS payment OrderId on Beget.
set -Eeuo pipefail
umask 077

fail(){ printf 'STOP (read-only check only): %s\n' "$*" >&2; exit 1; }
[[ "$(id -u)" == 0 ]] || fail 'Run as root in the Beget SSH shell'
[[ $# -eq 1 && "$1" =~ ^[0-9a-fA-F-]{36}$ ]] || fail 'Pass the T-Bank OrderId from the database result'
command -v docker >/dev/null || fail 'Docker is unavailable'
command -v python3 >/dev/null || fail 'Python 3 is unavailable on this server'
order_id="$1"

row="$(docker exec supabase-db psql -qAt -X -v ON_ERROR_STOP=1 -U postgres -d postgres -F '|' -c "SELECT payment_status,coalesce(payment_id,''),(payment_url IS NOT NULL)::text,coalesce(extract(epoch FROM (now()-payment_created_at))::bigint,0) FROM zags.couples WHERE order_id='${order_id}'::uuid;")" || fail 'Could not verify the ZAGS order in the database'
[[ -n "$row" ]] || fail 'The order was not found in the ZAGS database'
IFS='|' read -r status payment_id has_url age_seconds <<<"$row"
[[ "$status" == pending && -z "$payment_id" && "$has_url" == false ]] || fail 'Order is no longer pending without a payment link; no changes made'
(( age_seconds >= 300 )) || fail 'The order is less than five minutes old; wait before checking'

python3 - "$order_id" <<'PY'
import hashlib, json, subprocess, sys, urllib.request, urllib.error

order_id = sys.argv[1]
try:
    raw = subprocess.check_output([
        'docker', 'inspect', '--format', '{{range .Config.Env}}{{println .}}{{end}}',
        'supabase-edge-functions'
    ], text=True, stderr=subprocess.DEVNULL)
except Exception:
    print('STOP: could not inspect the Supabase Edge Functions container; no changes made')
    sys.exit(2)
env = {}
for line in raw.splitlines():
    if '=' in line:
        key, value = line.split('=', 1)
        env[key] = value
terminal = env.get('ZAGS_TBANK_TERMINAL_KEY', '')
password = env.get('ZAGS_TBANK_PASSWORD', '')
if not terminal or not password:
    print('STOP: T-Bank settings are not present in the Edge Functions container; no changes made')
    sys.exit(2)
fields = {'TerminalKey': terminal, 'OrderId': order_id, 'Password': password}
token = hashlib.sha256(''.join(str(fields[k]) for k in sorted(fields)).encode()).hexdigest()
payload = json.dumps({'TerminalKey': terminal, 'OrderId': order_id, 'Token': token}).encode()
request = urllib.request.Request('https://securepay.tinkoff.ru/v2/CheckOrder', data=payload, headers={'Content-Type':'application/json'}, method='POST')
try:
    with urllib.request.urlopen(request, timeout=20) as response:
        data = json.loads(response.read().decode())
except urllib.error.HTTPError as error:
    print(json.dumps({'orderId': order_id, 'httpStatus': error.code, 'success': False}, ensure_ascii=False, indent=2))
    sys.exit(2)
except Exception:
    print('STOP: T-Bank status request failed; no changes made')
    sys.exit(2)
payments = []
for p in data.get('Payments') or []:
    payments.append({
        'paymentId': str(p.get('PaymentId', '')),
        'amount': p.get('Amount'),
        'status': str(p.get('Status', '')),
        'success': p.get('Success'),
        'errorCode': p.get('ErrorCode')
    })
print(json.dumps({
    'orderId': order_id,
    'success': data.get('Success') is True,
    'errorCode': str(data.get('ErrorCode', '')),
    'message': str(data.get('Message', '')),
    'payments': payments
}, ensure_ascii=False, indent=2))
if data.get('Success') is not True:
    sys.exit(2)
print('Read-only check completed; no database or payment changes were made.')
PY
