#!/usr/bin/env bash
# Deploy the reviewed ZAGS payment parser fix only. No database or payment changes.
set -Eeuo pipefail
umask 077
REV='abcb062808e7358b5d254b54f444e5e3ccc21a30'
fail(){ printf 'STOP: %s\n' "$*" >&2; exit 1; }
[[ "$(id -u)" == 0 ]] || fail 'Run in the Beget root SSH shell'
command -v docker >/dev/null || fail 'docker is missing'
command -v curl >/dev/null || fail 'curl is missing'
command -v python3 >/dev/null || fail 'python3 is missing'

container=''
while IFS= read -r name; do
  [[ -n "$name" ]] || continue
  if [[ "$(docker inspect -f '{{ index .Config.Labels "com.docker.compose.service" }}' "$name" 2>/dev/null || true)" == functions ]]; then
    container="$name"
    break
  fi
done < <(docker ps --format '{{.Names}}')
[[ -n "$container" ]] || fail 'Could not find the Supabase functions container'

compose_dir="$(docker inspect -f '{{ index .Config.Labels "com.docker.compose.project.working_dir" }}' "$container")"
functions_source="$(docker inspect -f '{{range .Mounts}}{{if eq .Destination "/home/deno/functions"}}{{.Source}}{{end}}{{end}}' "$container")"
[[ -n "$compose_dir" && -d "$compose_dir" ]] || fail 'Could not locate the Supabase Compose project'
[[ -n "$functions_source" && -d "$functions_source/zags-payment" ]] || fail 'Could not locate the mounted ZAGS payment function'
(cd "$compose_dir" && docker compose config --quiet) || fail 'Supabase Compose config validation failed'

tmp="$(mktemp -d)"
backup="/root/backups/zags-payment-index-before-parser-fix-$(date -u +%Y%m%dT%H%M%SZ).ts"
mkdir -p /root/backups
trap 'rm -rf "$tmp"' EXIT
url="https://raw.githubusercontent.com/dimontattoo495-afk/ya-byl-zdes/$REV/zags/beget/functions/zags-payment/index.ts"
curl -fsSL --retry 2 --max-time 60 "$url" -o "$tmp/index.ts" || fail 'Could not download the pinned fixed source'
grep -Fq 'Deno.createHttpClient' "$tmp/index.ts" || fail 'Downloaded file does not include the T-Bank CA setup'
[[ -s "$functions_source/zags-payment/tbank-ca.pem" ]] || fail 'T-Bank CA bundle is missing from the mounted function directory'
python3 - "$tmp/index.ts" "$functions_source/zags-payment/tbank-ca.pem" "$tmp/index.rendered.ts" <<'PY'
import json, re, sys
source_path, ca_path, output_path = sys.argv[1:]
source = open(source_path, encoding='utf-8').read()
pem = open(ca_path, encoding='ascii').read()
certs = re.findall(r'-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----', pem)
marker = '"__TBANK_CA_CERTS_JSON__"'
if len(certs) < 2 or source.count(marker) != 1:
    raise SystemExit('STOP: expected a source marker and two CA certificates')
source = source.replace(marker, json.dumps(json.dumps(certs)))
open(output_path, 'w', encoding='utf-8').write(source)
PY
grep -Fq '"__TBANK_CA_CERTS_JSON__"' "$tmp/index.rendered.ts" && fail 'CA bundle was not embedded into the payment function'
if grep -Fq '\n    client:' "$tmp/index.rendered.ts"; then fail 'The parser error is still present in the downloaded file'; fi
grep -Fq 'client: await getTbankHttpClient(),' "$tmp/index.rendered.ts" || fail 'Expected T-Bank HTTP client line is missing'
cp -a "$functions_source/zags-payment/index.ts" "$backup"
install -m 0644 "$tmp/index.rendered.ts" "$functions_source/zags-payment/index.ts"
printf 'Installed reviewed source; backup: %s\n' "$backup"
started="$(date +%s)"
(cd "$compose_dir" && docker compose restart functions --no-deps) || fail 'Could not restart functions service'
sleep 4
recent_logs="$(docker logs --since "$started" "$container" 2>&1 || true)"
if grep -E 'failed to parse|Expected unicode escape' <<<"$recent_logs"; then
  fail 'Function still reports a parser error; source backup is available'
fi
printf '\nRecent function startup logs:\n'
grep -E 'serving the request with /home/deno/functions/zags-payment|worker boot error' <<<"$recent_logs" | tail -n 12 || true
printf '\nCurrent ZAGS payment service container: %s\n' "$container"
printf 'Parser error did not recur. No database rows or payments were changed.\n'
