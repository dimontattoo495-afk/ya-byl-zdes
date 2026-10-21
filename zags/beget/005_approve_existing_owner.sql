-- ONLY run manually on the verified local Beget Supabase.
-- Grants FOUR HOURS of ZAGS beta to one EXISTING CONFIRMED Auth account.
-- Variable owner_email comes from an interactive prompt and is quoted by psql
-- with :'owner_email' (never interpolate raw user text into a SQL string).
-- No new auth.users, TATTOO PRICE roles/tables, SMTP or public ZAGS config changed.
\set ON_ERROR_STOP on
BEGIN;
SELECT pg_advisory_xact_lock(hashtextextended('zags:private-beta-owner',0));
SELECT set_config('zags.owner_email',:'owner_email',true);
DO $approve$
DECLARE
  account_id uuid;
  approved_count integer;
BEGIN
  IF to_regclass('zags.preview_testers') IS NULL
   OR to_regclass('zags.couples') IS NULL
   OR to_regclass('auth.users') IS NULL THEN
    RAISE EXCEPTION 'Missing private beta schema. STOP.';
  END IF;
  SELECT count(*) INTO approved_count
    FROM zags.preview_testers WHERE enabled IS TRUE AND expires_at > now();
  IF approved_count<>0 THEN
    RAISE EXCEPTION 'There are already active testers. Review individually; no changes made.';
  END IF;

  SELECT id INTO account_id
    FROM auth.users
   WHERE lower(email)=lower(current_setting('zags.owner_email'))
     AND email_confirmed_at IS NOT NULL
     AND COALESCE(banned_until, '-infinity'::timestamptz)<now()
   LIMIT 1;
  IF account_id IS NULL THEN
    RAISE EXCEPTION 'Existing confirmed, non-banned account not found. No changes made.';
  END IF;

  INSERT INTO zags.preview_testers(user_id,enabled,expires_at)
  VALUES (account_id,true,now()+interval '4 hours')
  ON CONFLICT(user_id) DO UPDATE
    SET enabled=true,expires_at=now()+interval '4 hours';

  RAISE NOTICE 'Approved exactly ONE existing confirmed Beget Auth account for 4 hours.';
END $approve$;
COMMIT;
SELECT CASE WHEN count(*)=1
THEN 'PASS: ONE approved tester; auto-expiry in four hours'
ELSE 'FAIL: unexpected allowlist state' END AS verification
FROM zags.preview_testers
WHERE enabled IS TRUE AND expires_at>now();
