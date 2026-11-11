#!/usr/bin/env python3
"""Remove synthetic test account after completed ZAGS two-actor trial.

Purposefully excludes real users. Only accepts the one root-owned ID recorded
at /root/backups/zags-synthetic-partner-private.json with .invalid email.
No TP tables or Auth configuration modified. Test-only ZAGS couples with
this synthetic participant are removed if unpaid (first user's record affected).
"""
import base64, hashlib, hmac, json, os, pathlib, subprocess, sys, time, urllib.request, urllib.error, uuid
STATE=pathlib.Path("/root/backups/zags-synthetic-partner-private.json")
API="https://api.smoke-tattoo.ru/auth/v1/admin/users"
def stop(reason): print("STOP: "+reason);sys.exit(1)
def ps(sql):
 r=subprocess.run(["docker","exec","supabase-db","psql","-qAt","-X","-v","ON_ERROR_STOP=1","-U","postgres","-d","postgres","-c",sql],text=True,capture_output=True,timeout=20)
 if r.returncode: stop("Database guard failed, no Auth user removed")
 return r.stdout.strip()
def encode(v):return base64.urlsafe_b64encode(v).rstrip(b"=").decode()
def admin_jwt():
 r=subprocess.run(["docker","inspect","--format","{{json .Config.Env}}","supabase-auth"],capture_output=True,text=True,timeout=15)
 if r.returncode: stop("Missing local auth Docker configuration")
 e=dict(x.split("=",1) for x in json.loads(r.stdout) if "=" in x)
 secret=e.get("GOTRUE_JWT_SECRET","")
 if len(secret)<32:stop("Auth JWT secret missing")
 now=int(time.time())
 part=encode(b'{"alg":"HS256","typ":"JWT"}')+"."+encode(json.dumps({"iss":"supabase","role":"service_role","aud":"authenticated","iat":now,"exp":now+600},separators=(",",":")).encode())
 return part+"."+encode(hmac.new(secret.encode(),part.encode(),hashlib.sha256).digest())
def main():
 if os.geteuid()!=0:stop("Run on Beget as root")
 if not STATE.exists():stop("Synthetic test credentials state missing")
 if STATE.stat().st_mode&0o077:stop("Synthetic test credentials file must be private (0600)")
 record=json.loads(STATE.read_text())
 try: uid=uuid.UUID(record["user_id"])
 except (KeyError,ValueError):stop("Invalid synthetic user record")
 if not record["email"].startswith("zags-demo-") or not record["email"].endswith("@example.invalid"):
  stop("Refusing non-synthetic user ID")
 # No unrelated data are deleted. If active paid data somehow references synthetic
 # user, fail closed rather than corrupt it or delete a paying customer's record.
 guard=f"""SELECT CASE WHEN
   EXISTS(SELECT 1 FROM auth.users WHERE id='{uid}'::uuid
      AND email LIKE 'zags-demo-%@example.invalid')
   AND NOT EXISTS(SELECT 1 FROM zags.couples WHERE
     (creator='{uid}'::uuid OR partner='{uid}'::uuid)
      AND payment_status<>'unpaid')
   AND (SELECT count(*) FROM pg_tables WHERE schemaname='public' AND tablename LIKE 'tp_%')=14
   THEN 'READY' ELSE 'STOP' END"""
 if ps(guard)!="READY":stop("Synthetic account guard mismatch; manual review needed")
 print("THIS WILL DELETE synthetic account and any UNPAID ZAGS test couples with it.")
 if input("Type DELETE-TEST to confirm: ").strip()!="DELETE-TEST":
  stop("Cancelled: nothing changed")
 sql=f"""BEGIN;
   DELETE FROM zags.wishes WHERE author='{uid}'::uuid;
   DELETE FROM zags.couples WHERE (creator='{uid}'::uuid OR partner='{uid}'::uuid)
     AND payment_status='unpaid';
   DELETE FROM zags.preview_testers WHERE user_id='{uid}'::uuid;
   COMMIT;"""
 out=subprocess.run(["docker","exec","-i","supabase-db","psql","-q","-X","-v","ON_ERROR_STOP=1","-U","postgres","-d","postgres"],input=sql,capture_output=True,text=True,timeout=25)
 if out.returncode:stop("ZAGS cleanup transaction failed. Not deleting Auth account")
 key=admin_jwt()
 req=urllib.request.Request(API+"/"+str(uid),method="DELETE",headers={"Authorization":"Bearer "+key,"apikey":key})
 try:
  with urllib.request.urlopen(req,timeout=18) as resp: code=resp.status
 except (urllib.error.URLError,TimeoutError):
  stop("ZAGS test records removed; Auth user removal failed. Keep state file.")
 if code not in (200,204):stop("Unexpected Auth delete response. Keep state file.")
 STATE.unlink()
 print("PASS: synthetic Beget Auth tester and its unpaid ZAGS test records removed.")
 print("Existing TATTOO PRICE tables, real users, SMTP and payments untouched.")
if __name__=="__main__":main()
