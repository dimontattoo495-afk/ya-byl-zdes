\set ON_ERROR_STOP on
DO $$
BEGIN
  IF has_function_privilege('anon', 'public.zags_admin_is_admin()', 'EXECUTE')
     OR has_function_privilege('anon', 'public.zags_admin_summary_v1()', 'EXECUTE')
     OR has_function_privilege('anon', 'public.zags_admin_couples_v1(text,integer,integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon must not execute ZAGS admin RPCs';
  END IF;
  IF has_table_privilege('authenticated', 'zags.admins', 'SELECT') THEN
    RAISE EXCEPTION 'authenticated must not read the ZAGS admin allowlist directly';
  END IF;
END $$;

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',false);
DO $$
BEGIN
  IF public.zags_admin_is_admin() THEN RAISE EXCEPTION 'non-admin was granted access'; END IF;
  BEGIN
    PERFORM public.zags_admin_summary_v1();
    RAISE EXCEPTION 'expected non-admin rejection';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'expected non-admin rejection' THEN RAISE; END IF;
  END;
END $$;

RESET ROLE;
INSERT INTO zags.admins(user_id) VALUES ('00000000-0000-0000-0000-000000000001');
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);
DO $$
DECLARE s jsonb;
BEGIN
  IF NOT public.zags_admin_is_admin() THEN RAISE EXCEPTION 'allowlisted admin was denied'; END IF;
  s := public.zags_admin_summary_v1();
  IF (s->>'total')::integer <> 2 OR (s->>'paid')::integer <> 1
     OR (s->>'pending_partner')::integer <> 1 THEN
    RAISE EXCEPTION 'unexpected summary values: %', s;
  END IF;
  IF (SELECT count(*) FROM public.zags_admin_couples_v1('',100,0)) <> 2 THEN
    RAISE EXCEPTION 'admin list did not return expected rows';
  END IF;
END $$;

RESET ROLE;
SELECT 'PASS: ZAGS admin allowlist, grants and read-only RPCs' AS result;