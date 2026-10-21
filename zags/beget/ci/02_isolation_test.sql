-- CI ONLY: all user IDs and records are synthetic.
DO $qa$
DECLARE
  creator_id uuid:='11111111-1111-4111-8111-111111111111';
  partner_id uuid:='22222222-2222-4222-8222-222222222222';
  couple_id uuid;
  vcount integer;
BEGIN
 IF (SELECT count(*) FROM public.tp_listings)!=1 OR
    (SELECT title FROM public.tp_listings LIMIT 1)!='TATTOO PRICE MUST NOT CHANGE'
 THEN RAISE EXCEPTION 'Existing public TATTOO PRICE data were altered'; END IF;
 IF (SELECT count(*) FROM information_schema.tables WHERE table_schema='zags'
     AND table_name IN ('couples','wishes'))!=2
 THEN RAISE EXCEPTION 'Isolated ZAGS schema missing'; END IF;
 IF NOT (SELECT relrowsecurity AND relforcerowsecurity FROM pg_class
         WHERE oid='zags.couples'::regclass)
    OR NOT (SELECT relrowsecurity AND relforcerowsecurity FROM pg_class
         WHERE oid='zags.wishes'::regclass)
 THEN RAISE EXCEPTION 'RLS is not enforced'; END IF;
 IF has_schema_privilege('anon','zags','USAGE') OR
    has_schema_privilege('authenticated','zags','USAGE') OR
    has_table_privilege('authenticated','zags.couples','SELECT') OR
    has_table_privilege('authenticated','zags.couples','INSERT') OR
    has_table_privilege('anon','zags.wishes','SELECT') OR
    has_table_privilege('anon','zags.wishes','INSERT')
 THEN RAISE EXCEPTION 'Client roles gained direct database access'; END IF;
 IF NOT has_table_privilege('service_role','zags.couples','SELECT') OR
    NOT has_table_privilege('service_role','zags.wishes','INSERT')
 THEN RAISE EXCEPTION 'Service role permissions missing'; END IF;
 INSERT INTO auth.users(id) VALUES (creator_id),(partner_id);
 INSERT INTO zags.couples(creator,name1,name2,family,plan,invite_hash)
 VALUES(creator_id,'Тест А','Тест Б','Тест', 'basic',repeat('a',64))
 RETURNING id INTO couple_id;
 IF (SELECT payment_status FROM zags.couples WHERE id=couple_id)!='unpaid'
 THEN RAISE EXCEPTION 'Orders must initially be unpaid'; END IF;
 IF (SELECT share1 OR share2 OR news1 OR news2 FROM zags.couples WHERE id=couple_id)
 THEN RAISE EXCEPTION 'Private couple exposed by default'; END IF;
 BEGIN
   INSERT INTO zags.couples(creator,partner,name1,name2,family,plan,invite_hash)
   VALUES(creator_id,creator_id,'A','B','wrong','basic',repeat('c',64));
   RAISE EXCEPTION 'Self-partnership unexpectedly accepted';
 EXCEPTION WHEN check_violation THEN NULL; END;
 BEGIN
   UPDATE zags.couples SET married_at=now() WHERE id=couple_id;
   RAISE EXCEPTION 'Ceremony without two yes accepted';
 EXCEPTION WHEN check_violation THEN NULL; END;
 INSERT INTO zags.wishes(couple_id,author,name,message)
 VALUES(couple_id,partner_id,'Гость','Счастья');
 SELECT COUNT(*) INTO vcount FROM zags.wishes WHERE couple_id=couple_id;
 IF vcount!=1 THEN RAISE EXCEPTION 'Wishes insertion failed'; END IF;
 IF (SELECT COUNT(*) FROM pg_policies WHERE schemaname='zags')!=0
 THEN RAISE EXCEPTION 'No browser-visible row policies should exist yet'; END IF;
 RAISE NOTICE 'PASS: synthetic records, constraints, private roles, RLS, unchanged TP table';
END $qa$;
