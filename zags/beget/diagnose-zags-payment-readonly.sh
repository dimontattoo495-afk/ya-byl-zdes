#!/usr/bin/env bash
# Read-only diagnostic for the latest ZAGS payment reservation.
set -Eeuo pipefail
[[ "$(id -u)" == 0 ]] || { echo 'Run from Beget root SSH shell'; exit 1; }
command -v docker >/dev/null || { echo 'docker missing'; exit 1; }
row="$(docker exec supabase-db psql -qAt -X -v ON_ERROR_STOP=1 -U postgres -d postgres -F '|' -c "SELECT id::text,payment_status,coalesce(order_id::text,''),(payment_id IS NOT NULL)::text,(payment_url IS NOT NULL)::text,coalesce(payment_created_at::text,'') FROM zags.couples WHERE order_id IS NOT NULL ORDER BY payment_created_at DESC NULLS LAST LIMIT 1;")"
if [[ -z "$row" ]]; then
  echo 'No ZAGS reservation with an order_id was found.'
  exit 0
fi
IFS='|' read -r couple_id status order_id has_payment_id has_payment_url created_at <<<"$row"
printf 'Latest reservation: status=%s order_id=%s payment_id_saved=%s payment_url_saved=%s created_at=%s\n' "$status" "$order_id" "$has_payment_id" "$has_payment_url" "$created_at"

container=''
while IFS= read -r name; do
  [[ -n "$name" ]] || continue
  if [[ "$(docker inspect -f '{{ index .Config.Labels "com.docker.compose.service" }}' "$name" 2>/dev/null || true)" == functions ]]; then container="$name"; break; fi
done < <(docker ps --format '{{.Names}}')
if [[ -z "$container" ]]; then echo 'Functions container not found; database was not changed.'; exit 1; fi

python3 - "$order_id" "$container" <<'PY'
import hashlib, json, subprocess, sys, urllib.request, urllib.error
order_id, container = sys.argv[1], sys.argv[2]
raw = subprocess.check_output(['docker','inspect','--format','{{range .Config.Env}}{{println .}}{{end}}',container], text=True, stderr=subprocess.DEVNULL)
env = {line.split('=',1)[0]:line.split('=',1)[1] for line in raw.splitlines() if '=' in line}
terminal, password = env.get('ZAGS_TBANK_TERMINAL_KEY',''), env.get('ZAGS_TBANK_PASSWORD','')
if not terminal or not password:
    print('T-Bank check skipped: terminal credentials are not present in the functions container.')
    sys.exit(0)
fields = {'TerminalKey': terminal, 'OrderId': order_id, 'Password': password}
token = hashlib.sha256(''.join(fields[k] for k in sorted(fields)).encode()).hexdigest()
body = json.dumps({'TerminalKey':terminal,'OrderId':order_id,'Token':token}).encode()
req = urllib.request.Request('https://securepay.tinkoff.ru/v2/CheckOrder', data=body, headers={'Content-Type':'application/json'}, method='POST')
try:
    with urllib.request.urlopen(req, timeout=20) as r: result=json.loads(r.read().decode())
    payments=result.get('Payments') or []
    print('T-Bank CheckOrder: success=%s error_code=%s payments_count=%s status=%s' % (
        result.get('Success'), result.get('ErrorCode'), len(payments),
        ','.join(str(p.get('Status','')) for p in payments) or '-'))
    if result.get('Message'): print('T-Bank message:', str(result['Message'])[:240])
except Exception as e:
    print('T-Bank CheckOrder failed:', type(e).__name__, str(e)[:240])
PY

echo 'Recent relevant function errors (last 15 minutes):'
docker logs --since 15m "$container" 2>&1 | grep -Ei 'zags-payment|tbank-ca|path not found|permission denied|worker boot error|failed to parse|error|exception' | tail -n 25 || true
echo 'Read-only check finished; no database row or payment was changed.'
