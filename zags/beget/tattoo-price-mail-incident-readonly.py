#!/usr/bin/env python3
"""TATTOO PRICE outage: read-only local Beget SMTP and Supabase Auth preflight.

NO passwords, JWTs, IPs, email addresses, Docker paths, raw logs or env
values are emitted. Does not attempt a signup or send any email. Does not
restart, change .env, migrate data, or alter TATTOO PRICE/ZAGS tables.
"""
import json, socket, subprocess, sys, ssl

def capture(*args):
    try:
        p = subprocess.run(args, capture_output=True, text=True, timeout=18, check=False)
        return p.stdout if p.returncode == 0 else None
    except (OSError,subprocess.TimeoutExpired):
        return None

print("=== TP EMAIL INCIDENT: READ-ONLY ===")
auth_info = capture("docker","inspect","--format","{{json .Config.Env}}","supabase-auth")
if not auth_info:
    print("AUTH_CONTAINER=UNAVAILABLE")
    sys.exit(1)
try:
    cfg = dict(s.split("=",1) for s in json.loads(auth_info) if "=" in s)
except (ValueError, TypeError):
    print("AUTH_CONFIG=INVALID")
    sys.exit(1)

host = cfg.get("GOTRUE_SMTP_HOST","").strip()
port = cfg.get("GOTRUE_SMTP_PORT","").strip()
sender = cfg.get("GOTRUE_SMTP_ADMIN_EMAIL","")
print("AUTH_CONTAINER=FOUND")
print("CONFIRMATION_REQUIRED=" + str(cfg.get("GOTRUE_MAILER_AUTOCONFIRM","").lower()=="false").upper())
print("SMTP_TARGET_IS_DEFAULT_TEST=" + str(host in {"supabase-mail","inbucket","localhost","127.0.0.1"} and port=="2500").upper())
print("SMTP_PORT_IS_2500=" + str(port=="2500").upper())
print("SMTP_LOGIN_CONFIGURED=" + str(bool(cfg.get("GOTRUE_SMTP_USER","") and cfg.get("GOTRUE_SMTP_PASS",""))).upper())
print("SMTP_FROM_CONFIGURED=" + str(bool(sender)).upper())
print("AUTH_SERVICE_STATE=" + (capture("docker","inspect","--format","{{.State.Status}}","supabase-auth") or "UNKNOWN").strip().upper())

containers = capture("docker","ps","-a","--format","{{.Names}}|{{.State}}")
if containers is None: print("LOCAL_TEST_MAIL_CONTAINER=UNKNOWN")
else:
    matches=[x for x in containers.splitlines() if x.split("|")[0] in ("supabase-mail","inbucket")]
    status=("ABSENT" if not matches else ("RUNNING" if any(x.endswith("|running") for x in matches) else "STOPPED"))
    print("LOCAL_TEST_MAIL_CONTAINER="+status)

try:
    with socket.create_connection(("smtp.beget.com",465),timeout=8) as sock:
        with ssl.create_default_context().wrap_socket(sock,server_hostname="smtp.beget.com") as tls:
            print("BEGET_SMTP_465_TLS_REACHABLE=TRUE")
except (OSError,ssl.SSLError, TimeoutError):
    print("BEGET_SMTP_465_TLS_REACHABLE=FALSE")

tp = capture("docker","exec","supabase-db","psql","-qAt","-X","-v","ON_ERROR_STOP=1","-U","postgres","-d","postgres","-c",
    "SELECT count(*) FROM pg_tables WHERE schemaname='public' AND tablename LIKE 'tp_%'")
print("TP_TABLES_COUNT="+(tp.strip() if tp and tp.strip().isdigit() else "UNKNOWN"))
print("SUMMARY="+("DEFAULT_TEST_SMTP_NEEDS_REPLACEMENT" if host in {"supabase-mail","inbucket","localhost","127.0.0.1"} and port=="2500" else "REVIEW_REAL_SMTP_CONFIG"))
print("NO_CHANGES=TRUE")
