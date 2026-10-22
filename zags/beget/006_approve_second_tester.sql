-- PHASE: approve exactly one independent SECOND tester of existing Beget Auth.
-- Input :partner_email is psql variable, never put addresses in GitHub/chat.
-- Scope is ONLY private ZAGS tester list. No Auth account creation or TP changes.
\set ON_ERROR_STOP on
BEGIN;
SELECT pg_advisory_xact_lock(hashtextextended('zags:private-beta-owner',0)) AS exclusive_gate \gset
SELECT set_config('zags.partner_email', :'partner_email', true) AS private_email \gset
DO $grant_second$
DECLARE
  v_partner uuid;
  v_first uuid;
  v_active integer;
BEGIN
  IF to_regclass('zags.preview_testers') IS NULL OR
     to_regclass('zags.couples') IS NULL OR
     to_regclass('auth.users') IS NULL
  THEN RAISE EXCEPTION 'Private ZAGS beta was not installed'; END IF;

  SELECT count(*) INTO v_active
  FROM zags.preview_testers
  WHERE enabled=true AND expires_at>now();
  SELECT user_id INTO v_first
  FROM zags.preview_testers
  WHERE enabled=true AND expires_at>now()
  LIMIT 1;
  IF v_active<>1
  THEN RAISE EXCEPTION 'Exactly ONE owner beta tester required; found %',v_active; END IF;

  SELECT id INTO v_partner FROM auth.users
  WHERE lower(email)=lower(current_setting('zags.partner_email'))
    AND email_confirmed_at IS NOT NULL
    AND COALESCE(banned_until,'-infinity'::timestamptz)<now()
  LIMIT 1;
  IF v_partner IS NULL
  THEN RAISE EXCEPTION 'Second account is not confirmed in Beget Auth'; END IF;
  IF v_partner=v_first
  THEN RAISE EXCEPTION 'Partner must have a different confirmed account'; END IF;
  IF EXISTS(SELECT 1 FROM zags.preview_testers WHERE user_id=v_partner AND enabled)
  THEN RAISE EXCEPTION 'This account was already admitted'; END IF;

  INSERT INTO zags.preview_testers(user_id,enabled,expires_at)
  VALUES (v_partner,true,now()+interval '4 hours')
  ON CONFLICT (user_id) DO UPDATE SET enabled=true,expires_at=now()+interval '4 hours';
  RAISE NOTICE 'Second separate confirmed Beget account allowed for four hours';
END $grant_second$;
COMMIT;
SELECT CASE WHEN count(*)=2 THEN
  'PASS: 2 independent confirmed beta accounts (expires automatically)'
  ELSE 'FAIL: unexpected active tester count' END AS result
FROM zags.preview_testers WHERE enabled AND expires_at>now();
