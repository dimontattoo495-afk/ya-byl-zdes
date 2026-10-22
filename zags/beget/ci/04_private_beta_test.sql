-- CI synthetic-only verification for beta gate; NEVER execute against real customers.
DO $verify$
DECLARE
 n int;
BEGIN
 SELECT count(*) INTO n FROM zags.preview_testers;
 IF n!=0 THEN RAISE EXCEPTION 'Release must start with an EMPTY beta allowlist'; END IF;
 IF has_function_privilege('anon','public.zags_v2_action(text,jsonb)','EXECUTE')
 OR NOT has_function_privilege('authenticated','public.zags_v2_action(text,jsonb)','EXECUTE')
 THEN RAISE EXCEPTION 'Unexpected public API privileges'; END IF;
 IF has_table_privilege('authenticated','zags.preview_testers','INSERT')
 OR has_table_privilege('authenticated','zags.couples','SELECT')
 OR has_schema_privilege('authenticated','zags','USAGE')
 THEN RAISE EXCEPTION 'Authenticated visitors have direct access to private tables'; END IF;
END $verify$;

-- Assume a valid JWT from local Supabase Auth with id from 00_fixture.
SET ROLE authenticated;
SET request.jwt.claim.sub='11111111-1111-4111-8111-111111111111';
DO $deny$
BEGIN
 BEGIN
  PERFORM public.zags_v2_action('list','{}'::jsonb);
  RAISE EXCEPTION 'UNEXPECTED SUCCESS: unapproved authenticated user';
 EXCEPTION WHEN OTHERS THEN
  IF SQLERRM LIKE 'UNEXPECTED SUCCESS:%' THEN RAISE; END IF;
 END;
END $deny$;
RESET ROLE;

-- Only the database operator can approve two synthetic local accounts.
INSERT INTO zags.preview_testers(user_id,enabled,expires_at)
 VALUES
 ('11111111-1111-4111-8111-111111111111',true,now()+interval '12 hours'),
 ('22222222-2222-4222-8222-222222222222',true,now()+interval '12 hours');

SET ROLE authenticated;
SET request.jwt.claim.sub='11111111-1111-4111-8111-111111111111';
DO $owner$
DECLARE result jsonb;
BEGIN
 result:=public.zags_v2_action('list','{}'::jsonb);
 IF jsonb_typeof(result)<>'array'
 THEN RAISE EXCEPTION 'Approved owner cannot list own records'; END IF;
 result:=public.zags_v2_action('create',jsonb_build_object(
   'name1','Ева','name2','Макс','family','Проверка','plan','beautiful',
   'theme','rose','consent',true));
 IF result->>'id' IS NULL OR length(result->>'token')!=64
 THEN RAISE EXCEPTION 'Approved user cannot create test invitation'; END IF;
END $owner$;
RESET ROLE;

SET ROLE authenticated;
SET request.jwt.claim.sub='33333333-3333-4333-8333-333333333333';
DO $stranger$
BEGIN
 BEGIN
  PERFORM public.zags_v2_action('list','{}'::jsonb);
  RAISE EXCEPTION 'UNEXPECTED SUCCESS: stranger account';
 EXCEPTION WHEN OTHERS THEN
  IF SQLERRM LIKE 'UNEXPECTED SUCCESS:%' THEN RAISE; END IF;
 END;
END $stranger$;
RESET ROLE;

-- A timeout on the server closes test access without changing UI code.
UPDATE zags.preview_testers
  SET expires_at=now()-interval '1 second'
  WHERE user_id='11111111-1111-4111-8111-111111111111';

SET ROLE authenticated;
SET request.jwt.claim.sub='11111111-1111-4111-8111-111111111111';
DO $expired$
BEGIN
 BEGIN
  PERFORM public.zags_v2_action('list','{}'::jsonb);
  RAISE EXCEPTION 'UNEXPECTED SUCCESS: expired test authorization';
 EXCEPTION WHEN OTHERS THEN
  IF SQLERRM LIKE 'UNEXPECTED SUCCESS:%' THEN RAISE; END IF;
 END;
END $expired$;
RESET ROLE;

DO $complete$
BEGIN
 IF (SELECT count(*) FROM public.tp_listings)<>1
 OR (SELECT count(*) FROM pg_tables WHERE schemaname='zags'
       AND tablename IN ('couples','wishes','preview_testers'))<>3
 THEN RAISE EXCEPTION 'Another service was changed'; END IF;
 RAISE NOTICE 'PASS: zero testers by default, allowlisted JWT users only, expiration enforced, public table access denied';
END $complete$;
