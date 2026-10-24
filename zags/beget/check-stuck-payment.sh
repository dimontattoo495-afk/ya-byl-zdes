#!/usr/bin/env bash
# Read-only T-Bank status check for a stuck ZAGS payment OrderId.
set -Eeuo pipefail
umask 077

fail(){ printf 'STOP (read-only check only): %s\n' "$*" >&2; exit 1; }
[[ "$(id -u)" == 0 ]] || fail 'Run as root in the Beget SSH shell'
[[ $# -eq 1 && "$1" =~ ^[0-9a-fA-F-]{36}$ ]] || fail 'Pass the T-Bank OrderId from the previous database check'
command -v docker >/dev/null || fail 'Docker is unavailable'
order_id="$1"

functions_container=""
while IFS= read -r name; do
  [[ -n "$name" ]] || continue
  if docker exec "$name" deno eval --allow-env=ZAGS_TBANK_TERMINAL_KEY,ZAGS_TBANK_PASSWORD 'if (!Deno.env.get("ZAGS_TBANK_TERMINAL_KEY") || !Deno.env.get("ZAGS_TBANK_PASSWORD")) Deno.exit(1);' >/dev/null 2>&1; then
    functions_container="$name"
    break
  fi
done < <(docker ps --format '{{.Names}}')
[[ -n "$functions_container" ]] || fail 'Could not find a running container with ZAGS payment settings'
printf 'Checking T-Bank OrderId %s (read-only).\n' "$order_id"
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
console.log(JSON.stringify({ orderId, success: data.Success === true, errorCode: String(data.ErrorCode ?? ""), message: String(data.Message ?? ""), payments }, null, 2));
if (!response.ok || data.Success !== true) Deno.exit(2);
' || fail 'T-Bank status check did not complete; no changes made'

printf 'No database rows or payment settings were changed.\n'
