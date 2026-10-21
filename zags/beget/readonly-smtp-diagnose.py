#!/usr/bin/env python3
"""Read-only, no-secrets Supabase self-hosted SMTP failure report.

No SMTP credentials, user email, URL tokens, confirmation links, IP addresses,
raw logs or environment values are printed. Does not change Auth or Docker.
"""
import json
import re
import subprocess
import sys

NAME = "supabase-auth"

def run(args):
    return subprocess.run(args, text=True, capture_output=True, timeout=20, check=False)

try:
    info = run(["docker", "inspect", "--format", "{{json .Config.Env}}", NAME])
except (OSError, subprocess.TimeoutExpired):
    print("STATUS=Unable to inspect auth container")
    sys.exit(1)
if info.returncode != 0:
    print("STATUS=Auth container not found")
    sys.exit(1)
try:
    entries = json.loads(info.stdout)
    env = dict(entry.split("=", 1) for entry in entries if "=" in entry)
except (ValueError, TypeError):
    print("STATUS=Could not parse auth environment safely")
    sys.exit(1)

def setting(label, *names):
    value = next((env[n] for n in names if n in env), "")
    print(f"{label}={'SET' if value.strip() else 'MISSING_OR_EMPTY'}")
    return value

print("=== BEGET AUTH: CONFIGURATION PRESENCE ONLY ===")
host = setting("SMTP_HOST", "GOTRUE_SMTP_HOST", "SMTP_HOST")
port = setting("SMTP_PORT", "GOTRUE_SMTP_PORT", "SMTP_PORT")
setting("SMTP_USER", "GOTRUE_SMTP_USER", "SMTP_USER")
setting("SMTP_PASS", "GOTRUE_SMTP_PASS", "SMTP_PASS")
setting("SMTP_FROM_EMAIL", "GOTRUE_SMTP_ADMIN_EMAIL", "SMTP_ADMIN_EMAIL")
setting("SMTP_SENDER_NAME", "GOTRUE_SMTP_SENDER_NAME", "SMTP_SENDER_NAME")
print("SMTP_PORT_CLASS=" + (
    "STANDARD_587" if port.strip()=="587" else
    "STANDARD_465" if port.strip()=="465" else
    "PORT_25_POSSIBLY_FILTERED" if port.strip()=="25" else
    "TEST_ONLY_2500" if port.strip()=="2500" else
    "OTHER_OR_EMPTY"
))
if host.strip().lower() in ("supabase-mail", "mail", "localhost", "127.0.0.1"):
    print("SMTP_HOST_WARNING=LOCAL_OR_DEFAULT_PLACEHOLDER_CHECK_CONTAINER")
else:
    print("SMTP_HOST_WARNING=NO_DEFAULT_PLACEHOLDER_DETECTED")
autoconfirm = env.get("GOTRUE_MAILER_AUTOCONFIRM", "")
print("EMAIL_CONFIRMATION=" + (
    "REQUIRED" if autoconfirm.strip().lower()=="false" else
    "NOT_REQUIRED" if autoconfirm.strip().lower()=="true" else
    "UNKNOWN"
))

try:
    log = run(["docker", "logs", "--since", "45m", "--tail", "800", NAME])
    raw = (log.stdout or "") + "\n" + (log.stderr or "")
except (OSError, subprocess.TimeoutExpired):
    raw = ""
raw = raw[-350000:].lower()
signals = {
    "SMTP_DNS_RESOLUTION": r"no such host|server misbehaving|name or service not known|temporary failure in name resolution|dns error|lookup .* on .*:53",
    "SMTP_CONNECT_TIMEOUT": r"i/o timeout|connection timed out|network is unreachable|no route to host|dial tcp.*timeout",
    "SMTP_CONNECTION_REFUSED": r"connection refused|actively refused|connect: refused",
    "SMTP_CREDENTIALS_REJECTED": r"535\b|bad credentials|invalid credentials|authentication failed|authentication unsuccessful|invalid login|smtp.*auth failed",
    "SMTP_TLS_OR_CERTIFICATE": r"unencrypted connection|starttls|tls handshake|x509:|certificate verify|certificate signed by unknown|first record does not look like a tls",
    "SMTP_SENDER_OR_RECIPIENT_REJECTED": r"sender rejected|recipient rejected|mailbox unavailable|relay access denied|email address not authorized|554\b|550\b|553\b",
    "SMTP_RATE_LIMIT": r"rate.?limit|too many requests|too many emails|throttle|429\b",
    "SMTP_TEMPLATE": r"template.*(invalid|fail|error)|error.*template",
    "CONFIRMATION_EMAIL_FAILURE": r"error sending confirmation email|error sending confirmation mail",
}
print("=== CLASSIFIED AUTH LOG ERRORS (PAST 45 MINUTES) ===")
for name, regex in signals.items():
    hits = len(re.findall(regex, raw, re.IGNORECASE))
    print(f"{name}={'YES' if hits else 'NO'}")
print("AUTH_LOGS_READ=" + ("YES" if log.returncode == 0 else "NO"))
print("=== SAFE NEXT STEP ===")
if any(re.search(signals[k],raw,re.IGNORECASE) for k in signals if k not in ("CONFIRMATION_EMAIL_FAILURE",)):
    print("DIAGNOSIS=SPECIFIC_SMTP_FAILURE_CATEGORY_ABOVE")
elif re.search(signals["CONFIRMATION_EMAIL_FAILURE"],raw,re.IGNORECASE):
    print("DIAGNOSIS=CONFIRMATION_FAILURE_RECORDED_WITHOUT_RECOGNIZED_SMTP_REASON")
else:
    print("DIAGNOSIS=NO_RELEVANT_FAILURE_IN_RECENT_LOGS")
print("DONE=READ_ONLY_NO_SECRETS_NO_CHANGES")
