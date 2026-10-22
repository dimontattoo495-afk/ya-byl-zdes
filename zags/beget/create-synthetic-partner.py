#!/usr/bin/env python3
"""Create ONE synthetic confirmed user solely to test the two-actor ZAGS flow.

Operate only on owner's own Beget VPS, as root.
Uses GoTrue's documented Admin createUser (no confirmation email).
NO direct auth.users INSERT, no SMTP changes, no container restarts.
The artificial RFC 2606 ".invalid" email is never a real user's address.
Credentials are written only to a local root-only file, never printed.
"""
import base64
import datetime
import hashlib
import hmac
import json
import os
import pathlib
import secrets
import subprocess
import sys
import time
import urllib.error
import urllib.request
import uuid

BACKUPS = pathlib.Path("/root/backups")
STATE = BACKUPS / "zags-synthetic-partner-private.json"
LOGIN = "https://api.smoke-tattoo.ru/auth/v1/admin/users"

def stop(reason):
    print("STOP: " + reason)
    sys.exit(1)

def run(argv, inp=None):
    p = subprocess.run(argv, input=inp, capture_output=True, text=True, timeout=25, check=False)
    if p.returncode:
        stop("Local preflight/SQL failed; no changes to TATTOO PRICE requested")
    return p.stdout.strip()

def b64(raw):
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode("ascii")

def jwt(secret, role):
    now = int(time.time())
    head = b64(json.dumps({"alg":"HS256","typ":"JWT"},separators=(",",":")).encode())
    body = b64(json.dumps({"iss":"supabase","role":role,"aud":"authenticated",
        "iat":now,"exp":now+600},separators=(",",":")).encode())
    unsigned = head+"."+body
    signature = b64(hmac.new(secret.encode(), unsigned.encode(), hashlib.sha256).digest())
    return unsigned+"."+signature

def auth_config():
    raw = run(["docker","inspect","--format","{{json .Config.Env}}","supabase-auth"])
    fields = json.loads(raw)
    env = dict(x.split("=",1) for x in fields if "=" in x)
    secret = env.get("GOTRUE_JWT_SECRET","")
    roles = env.get("GOTRUE_JWT_ADMIN_ROLES","service_role").replace(" ", "").split(",")
    if len(secret)<32 or "service_role" not in roles:
        stop("Service role secret or admin permission not present in local auth container")
    return secret

def request(method, path, key, data=None):
    headers = {"Authorization":"Bearer "+key,"apikey":key,"Accept":"application/json"}
    if data is not None:
        headers["Content-Type"]="application/json"
    msg = json.dumps(data,ensure_ascii=False).encode() if data is not None else None
    req = urllib.request.Request(path,data=msg,headers=headers,method=method)
    try:
        with urllib.request.urlopen(req,timeout=18) as resp:
            return resp.status,json.loads(resp.read(120000) or b"{}")
    except urllib.error.HTTPError as e:
        # Never show server response contents: may expose email/JWT.
        stop("Auth Admin API refused request (HTTP "+str(e.code)+"); nothing to copy")
    except (urllib.error.URLError,TimeoutError):
        stop("Local Beget Auth Admin API not reachable over verified HTTPS")
    except json.JSONDecodeError:
        stop("Auth Admin API returned invalid response format")

def cleanup(key, uid):
    try:
        req=urllib.request.Request(LOGIN+"/"+str(uid),headers={
            "Authorization":"Bearer "+key,"apikey":key
        },method="DELETE")
        urllib.request.urlopen(req,timeout=10).close()
        print("ROLLBACK: temporary Auth account deleted")
    except Exception:
        print("WARNING: rollback could not delete synthetic Auth account; requires manual review")

def database(sql):
    return run(["docker","exec","supabase-db","psql","-X","-qAt",
         "-v","ON_ERROR_STOP=1","-U","postgres","-d","postgres","-c",sql])

def main():
    if os.geteuid()!=0: stop("Run only as root on Beget")
    if not BACKUPS.is_dir() or not (BACKUPS/"tattoo-price-2026-10-21.dump").is_file():
        stop("Required prior Beget backups not found")
    if STATE.exists():
        stop("Previous temporary test-user credentials exist; inspect/cleanup before creating another")
    # Fail closed if the first approved user expired or unknown production state.
    check = """SELECT CASE
       WHEN to_regclass('zags.preview_testers') IS NOT NULL
        AND (SELECT count(*) FROM zags.preview_testers WHERE enabled AND expires_at>now())=1
        AND (SELECT count(*) FROM pg_tables WHERE schemaname='public' AND tablename LIKE 'tp_%')=14
        AND (SELECT count(*) FROM zags.couples WHERE payment_status<>'unpaid')=0
       THEN 'READY' ELSE 'STOP' END"""
    if database(check) != "READY":
        stop("Expected one currently approved owner, empty payment state and 14 TP tables")
    print("CHECK=PASS (1 owner, no payments, TP unchanged)")
    secret=auth_config()
    token=jwt(secret,"service_role")
    synthetic="zags-demo-"+secrets.token_hex(8)+"@example.invalid"
    password=secrets.token_urlsafe(24)
    payload={"email":synthetic,"password":password,"email_confirm":True,
             "user_metadata":{"purpose":"TEMP_ZAGS_TWO_ACTOR_TEST"}}
    status,data=request("POST",LOGIN,token,payload)
    user=data.get("user",data) if isinstance(data,dict) else {}
    try:
        user_id=uuid.UUID(str(user["id"]))
    except (TypeError,ValueError,KeyError):
        stop("Synthetic user created but ID missing; check GoTrue Auth Admin response locally")
    # Validate the synthetic account is confined to a new auth.users row.
    assert str(user_id) == str(uuid.UUID(str(user_id)))
    sql = f"""BEGIN;
    DO $guard$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id='{user_id}'::uuid
          AND email_confirmed_at IS NOT NULL
          AND email LIKE 'zags-demo-%@example.invalid') THEN
        RAISE EXCEPTION 'Synthetic confirmed account not present in local Beget Auth';
      END IF;
      IF (SELECT count(*) FROM zags.preview_testers
          WHERE enabled AND expires_at > now()) <> 1 THEN
        RAISE EXCEPTION 'Existing owner grant absent or expired';
      END IF;
      IF (SELECT count(*) FROM pg_tables
          WHERE schemaname='public' AND tablename LIKE 'tp_%') <> 14 THEN
        RAISE EXCEPTION 'TATTOO PRICE environment changed';
      END IF;
    END $guard$;
    INSERT INTO zags.preview_testers(user_id,enabled,expires_at)
      VALUES ('{user_id}',TRUE,now()+interval '90 minutes');
    COMMIT;"""
    result=subprocess.run(["docker","exec","-i","supabase-db","psql","-X","-qAt",
            "-v","ON_ERROR_STOP=1","-U","postgres","-d","postgres"],
            input=sql,capture_output=True,text=True,timeout=25,check=False)
    if result.returncode:
        cleanup(token,user_id)
        stop("Database did not approve synthetic test account; check requirements")
    # Save credentials only on the VPS, mode 0600; do not expose via chat.
    tmp=STATE.with_suffix(".tmp")
    fd=os.open(tmp,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
    with os.fdopen(fd,"w") as out:
        json.dump({"email":synthetic,"password":password,"user_id":str(user_id),
            "created_utc":datetime.datetime.now(datetime.timezone.utc).isoformat(),
            "purpose":"synthetic test identity ONLY; delete after test"},out,ensure_ascii=False)
        out.write("\n")
    os.replace(tmp,STATE)
    os.chmod(STATE,0o600)
    password=None
    print("PASS: one synthetic confirmed test account created without SMTP.")
    print("ZAGS_TESTER_ACCESS=90_MINUTES")
    print("TATTOO_PRICE_TABLES=UNCHANGED")
    print("TEST_CREDENTIALS_FILE="+str(STATE))
    print("READ LOCALLY ONLY: python3 -c 'import json; x=json.load(open(\""+str(STATE)+"\")); print(\"login:\", x[\"email\"], \"\\npassword:\", x[\"password\"])'")
    print("IMPORTANT: do not show these credentials in screenshots/chat. Delete test Auth user after check.")
if __name__=="__main__":
    main()
