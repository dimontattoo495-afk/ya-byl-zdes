-- CI-only: no real user data and no actual payment.
DO $onboarding$
DECLARE
 a uuid:='11111111-1111-4111-8111-111111111111';
 b uuid:='22222222-2222-4222-8222-222222222222';
 stranger uuid:='33333333-3333-4333-8333-333333333333';
 created jsonb;
 invited jsonb;
 accepted jsonb;
 details jsonb;
 pair_id uuid;
 token text;
 rejected boolean;
BEGIN
 INSERT INTO auth.users(id) VALUES (stranger);

 IF has_function_privilege('authenticated','public.zags_v2_action(text,jsonb)','EXECUTE')
 OR has_function_privilege('anon','public.zags_v2_action(text,jsonb)','EXECUTE')
 OR NOT has_function_privilege('service_role','public.zags_v2_action(text,jsonb)','EXECUTE')
 THEN RAISE EXCEPTION 'Staged onboarding RPC must remain hidden from public PostgREST clients'; END IF;
 IF has_table_privilege('authenticated','zags.couples','SELECT')
 THEN RAISE EXCEPTION 'New onboarding accidentally exposes private tables'; END IF;

 PERFORM set_config('request.jwt.claim.sub',a::text,true);
 created:=public.zags_v2_action('create',jsonb_build_object(
   'name1','Алекс','name2','Саша','family','Тестовая пара','plan','beautiful','theme','ivory',
   'consent',true
 ));
 pair_id:=(created->>'id')::uuid;
 token:=created->>'token';
 IF pair_id IS NULL OR length(token)<>64 THEN RAISE EXCEPTION 'Application invitation missing'; END IF;
 IF (SELECT payment_status FROM zags.couples WHERE id=pair_id)<>'unpaid'
 THEN RAISE EXCEPTION 'New order not unpaid'; END IF;
 IF (SELECT count(*) FROM zags.couples WHERE id=pair_id AND partner IS NOT NULL)>0
 THEN RAISE EXCEPTION 'Unaccepted order got a partner'; END IF;

 rejected:=false;
 BEGIN
   PERFORM public.zags_v2_action('accept',jsonb_build_object(
     'id',pair_id,'token',token,'name','Саша','consent',true
   ));
 EXCEPTION WHEN others THEN rejected:=true;
 END;
 IF NOT rejected THEN RAISE EXCEPTION 'Creator was able to accept own invite'; END IF;

 PERFORM set_config('request.jwt.claim.sub','',true);
 invited:=public.zags_v2_action('invitation',jsonb_build_object('id',pair_id,'token',token));
 IF invited->>'family'<>'Тестовая пара' THEN RAISE EXCEPTION 'Anonymous invitation preview failed'; END IF;
 rejected:=false;
 BEGIN PERFORM public.zags_v2_action('get',jsonb_build_object('id',pair_id));
 EXCEPTION WHEN others THEN rejected:=true; END;
 IF NOT rejected THEN RAISE EXCEPTION 'Anonymous access to private couple'; END IF;

 PERFORM set_config('request.jwt.claim.sub',b::text,true);
 accepted:=public.zags_v2_action('accept',jsonb_build_object(
   'id',pair_id,'token',token,'name','Саша','consent',true
 ));
 IF accepted->>'has_partner'!='true' OR accepted->>'role'!='2'
 THEN RAISE EXCEPTION 'Partner was not accepted as independent actor'; END IF;
 IF accepted ? 'invite_hash' OR accepted ? 'payment_url'
 THEN RAISE EXCEPTION 'Internal secrets leaked in couple response'; END IF;

 rejected:=false;
 BEGIN
  PERFORM public.zags_v2_action('invitation',jsonb_build_object('id',pair_id,'token',token));
 EXCEPTION WHEN others THEN rejected:=true; END;
 IF NOT rejected THEN RAISE EXCEPTION 'Used invitation replayed'; END IF;

 PERFORM set_config('request.jwt.claim.sub',stranger::text,true);
 rejected:=false;
 BEGIN PERFORM public.zags_v2_action('get',jsonb_build_object('id',pair_id));
 EXCEPTION WHEN others THEN rejected:=true; END;
 IF NOT rejected THEN RAISE EXCEPTION 'Unrelated user accessed private couple'; END IF;
 rejected:=false;
 BEGIN PERFORM public.zags_v2_action('yes',jsonb_build_object('id',pair_id));
 EXCEPTION WHEN others THEN rejected:=true; END;
 IF NOT rejected THEN RAISE EXCEPTION 'Unverified payment/ceremony action enabled'; END IF;
 
 PERFORM set_config('request.jwt.claim.sub',a::text,true);
 details:=public.zags_v2_action('get',jsonb_build_object('id',pair_id));
 IF details->>'role'!='1' OR details->>'payment_status'!='unpaid'
 THEN RAISE EXCEPTION 'Creator could not read own unpaid couple'; END IF;

 RAISE NOTICE 'PASS: two-account invite flow, no token leaks, anti-replay, no stranger/anon access, bank disabled';
END $onboarding$;
