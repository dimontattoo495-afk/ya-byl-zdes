#!/usr/bin/env bash
# Read-only recovery diagnostic for one stuck ZAGS payment on the Beget Supabase host.
set -Eeuo pipefail
umask 077

fail(){ printf 'STOP (read-only check only): %s\n' "$*" >&2; exit 1; }
[[ "$(id -u)" == 0 ]] || fail 'Run as root in the Beget SSH shell'
[[ $# -eq 1 && "$1" =~ ^[0-9a-fA-F-]{36}$ ]] || fail 'Pass the couple UUID shown by the previous database check'
command -v docker >/dev/null || fail 'Docker is unavailable'

couple_id="$1"
row="$(docker exec supabase-db psql -qAt -X -v ON_ERROR_STOP=1 -U postgres -d postgres -F '|' -c "SELECT payment_status,coalesce(order_id::text,''),coalesce(payment_id,''),(payment_url IS NOT NULL)::text,coalesce(extract(epoch FROM (now()-payment_created_at))::bigint,0) FROM zags.couples WHERE id='\${couple_id}';")" || fail 'Could not read the ZAGS order'
[[ -n "$row" ]] || fail 'The couple record was not found'
IFS='|' read -r status order_id payment_id has_url age_seconds <<<"$row"
[[ "$status" == pending ]] || fail "Order status is '$status', not pending; no changes made"
[[ -n "$order_id" && "$order_id" =~ ^[0-9a-fA-F-]{36}$ ]] || fail 'There is no valid reserved OrderId'
[[ -z "$payment_id" && "$has_url" == f ]] || fail 'A bank payment ID or URL is already saved; no changes made'
(( age_seconds >= 300 )) || fail 'The order is less than five minutes old; wait before checking'

functions_container=""
while IFS= read -r name; do
  [[ -n "$name" ]] || continue
  if [[ "$(docker inspect -f '{{ index .Config.Labels "com.docker.compose.service" }}' "$name" 2>/dev/null || true)" == functions ]]; then
    functions_container="$name"
    break
  fi
done < <(docker ps --format '{{.Names}}')
[[ -n "$functions_container" ]] || fail 'Could not find the existing functions container'

printf 'Checking T-Bank order status (read-only).\n'
docker exec -e ZAGS_CHECK_ORDER_ID="$order_id" "$functions_container" deno eval \
  --allow-net=securepay.tinkoff.ru:443 \
  --allow-env=ZAGS_TBANK_TERMINAL_KEY,ZAGS_TBANK_PASSWORD,ZAGS_CHECK_ORDER_ID \
  '
const terminal = Deno.env.get("ZAGS_TBANK_TERMINAL_KEY") || "";
const password = Deno.env.get("ZAGS_TBANK_PASSWORD") || "";
const orderId = Deno.env.get("ZAGS_CHECK_ORDER_ID") || "";
if (!terminal || !password || !orderId) throw new Error("Required payment settings are not available");
const fields = { TerminalKey: terminal, OrderId: orderId, Password: password };
const value = Object.keys(fields).sort().map((key) => String(fields[key])).join("");
const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
const token = [...digest].map((b) => b.toString(16).padStart(2, "0")).join("");
const response = await fetch("https://securepay.tinkoff.ru/v2/CheckOrder", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ TerminalKey: terminal, OrderId: orderId, Token: token }),
  signal: AbortSignal.timeout(15000),
});
const data = await response.json();
const payments = Array.isArray(data.Payments) ? data.Payments.map((p) => ({
  paymentId: String(p.PaymentId ?? ""),
  amount: p.Amount ?? null,
  status: String(p.Status ?? ""),
  success: p.Success ?? null,
  errorCode: p.ErrorCode ?? null,
})) : [];
console.log(JSON.stringify({
  orderId,
  success: data.Success === true,
  errorCode: String(data.ErrorCode ?? ""),
  message: String(data.Message ?? ""),
  payments,
}, null, 2));
if (!response.ok || data.Success !== true) Deno.exit(2);
' || fail 'T-Bank status check did not complete; no changes made'

printf 'No database rows or payment settings were changed.\n'
