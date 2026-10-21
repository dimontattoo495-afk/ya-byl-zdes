-- PHASE-2 RELEASE: installed on live Beget by owner 2026-10-21 (installer PASS).
-- DO NOT REAPPLY: guard intentionally refuses a second installation.
-- Grants access only to authenticated AND explicitly allowlisted testers.
-- Starts with ZERO approved users; all requests are refused until owner approval.
-- Never change TATTOO PRICE tables, main Supabase Auth or T-Bank payment functions.
BEGIN;
DO $guard$
BEGIN
 IF to_regclass('zags.couples') IS NULL OR to_regprocedure('public.zags_v2_action(text,jsonb)') IS NULL
 THEN RAISE EXCEPTION 'Phase 1 isolated ZAGS schema must be installed first'; END IF;
 IF to_regclass('zags.preview_testers') IS NOT NULL
 THEN RAISE EXCEPTION 'Refusing to overwrite existing beta allowlist'; END IF;
END $guard$;

CREATE TABLE zags.preview_testers(
 user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
 enabled boolean NOT NULL DEFAULT false,
 expires_at timestamptz NOT NULL DEFAULT now() + interval '2 days',
 created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE zags.preview_testers ENABLE ROW LEVEL SECURITY;
ALTER TABLE zags.preview_testers FORCE ROW LEVEL SECURITY;
REVOKE ALL ON zags.preview_testers FROM PUBLIC, anon, authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON zags.preview_testers TO service_role;

CREATE OR REPLACE FUNCTION public.zags_v2_action(p_action text,p_data jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public,auth,pg_temp
AS $function$
DECLARE
  u uuid:=auth.uid();
  c zags.couples%ROWTYPE;
  invite text;
  raw_id uuid;
  name_given text;
BEGIN
  -- Private owner-approved beta gate: no user can call any action by default.
  -- Authentication on this shared Supabase is NOT sufficient without allowlist.
  IF u IS NULL OR NOT EXISTS(
     SELECT 1 FROM zags.preview_testers
      WHERE user_id=u AND enabled IS TRUE AND expires_at>now()
  ) THEN RAISE EXCEPTION 'Доступ к тестированию ещё не открыт'; END IF;

  IF p_action='invitation' THEN
    raw_id:=(p_data->>'id')::uuid;
    SELECT * INTO c FROM zags.couples WHERE id=raw_id;
    IF NOT FOUND OR c.partner IS NOT NULL OR c.expires_at<now()
       OR c.invite_hash<>encode(sha256(convert_to(coalesce(p_data->>'token',''),'UTF8')),'hex')
    THEN RAISE EXCEPTION 'Приглашение недействительно'; END IF;
    RETURN jsonb_build_object('id',c.id,'name1',c.name1,'name2',c.name2,
      'family',c.family,'plan',c.plan,'scheduled_at',c.scheduled_at);
  END IF;

  IF u IS NULL THEN RAISE EXCEPTION 'Требуется авторизация'; END IF;

  IF p_action='list' THEN
    RETURN coalesce((
      SELECT jsonb_agg(to_jsonb(t) ORDER BY t.created_at DESC)
      FROM (
        SELECT id,family,married_at,created_at FROM zags.couples
        WHERE creator=u OR partner=u ORDER BY created_at DESC LIMIT 100
      ) AS t
    ),'[]'::jsonb);
  END IF;

  IF p_action='create' THEN
    IF p_data->>'consent' IS DISTINCT FROM 'true'
    THEN RAISE EXCEPTION 'Требуется явное согласие'; END IF;
    IF p_data->>'plan' NOT IN ('basic','beautiful','party')
    THEN RAISE EXCEPTION 'Выберите тариф'; END IF;
    name_given:=btrim(coalesce(p_data->>'name1',''));
    IF length(name_given) NOT BETWEEN 1 AND 60
       OR length(btrim(coalesce(p_data->>'name2',''))) NOT BETWEEN 1 AND 60
       OR length(btrim(coalesce(p_data->>'family',''))) NOT BETWEEN 1 AND 80
    THEN RAISE EXCEPTION 'Некорректные имена или название семьи'; END IF;
    PERFORM pg_advisory_xact_lock(hashtextextended(u::text,0));
    IF (SELECT count(*) FROM zags.couples WHERE creator=u
       AND created_at>now()-interval '1 day')>=5
    THEN RAISE EXCEPTION 'Можно создать не более 5 заявлений в сутки'; END IF;
    invite:=replace(gen_random_uuid()::text,'-','')||
            replace(gen_random_uuid()::text,'-','');
    INSERT INTO zags.couples(
      creator,name1,name2,family,plan,theme,invite_hash,scheduled_at,vow1
    ) VALUES(
      u,name_given,btrim(p_data->>'name2'),btrim(p_data->>'family'),
      p_data->>'plan',
      CASE WHEN p_data->>'plan'='basic' THEN 'rose'
           ELSE coalesce(p_data->>'theme','rose') END,
      encode(sha256(convert_to(invite,'UTF8')),'hex'),
      nullif(coalesce(p_data->>'scheduled_at',''),'')::timestamptz,
      CASE WHEN p_data->>'plan'='basic' THEN ''
           ELSE coalesce(p_data->>'vow','') END
    ) RETURNING * INTO c;
    RETURN jsonb_build_object('id',c.id,'token',invite);
  END IF;

  raw_id:=(p_data->>'id')::uuid;
  SELECT * INTO c FROM zags.couples WHERE id=raw_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Заявление не найдено'; END IF;

  IF p_action='accept' THEN
    IF u=c.creator THEN RAISE EXCEPTION 'Требуется отдельный аккаунт партнёра'; END IF;
    IF c.partner IS NOT NULL OR c.expires_at<now()
       OR c.invite_hash<>encode(sha256(convert_to(coalesce(p_data->>'token',''),'UTF8')),'hex')
    THEN RAISE EXCEPTION 'Приглашение недействительно'; END IF;
    IF p_data->>'consent' IS DISTINCT FROM 'true'
    THEN RAISE EXCEPTION 'Требуется согласие второго участника'; END IF;
    name_given:=btrim(coalesce(p_data->>'name',''));
    IF length(name_given) NOT BETWEEN 1 AND 60
    THEN RAISE EXCEPTION 'Некорректное имя'; END IF;
    UPDATE zags.couples SET partner=u,accepted_at=now(),name2=name_given,
      vow2=CASE WHEN plan='basic' THEN '' ELSE coalesce(p_data->>'vow','') END
    WHERE id=raw_id RETURNING * INTO c;
  ELSIF p_action='cancel' THEN
    IF c.creator IS DISTINCT FROM u OR c.partner IS NOT NULL
       OR c.payment_status<>'unpaid' OR c.payment_id IS NOT NULL
       OR c.order_id IS NOT NULL
    THEN RAISE EXCEPTION 'Заявление нельзя удалить без обращения в поддержку'; END IF;
    DELETE FROM zags.couples WHERE id=raw_id;
    RETURN jsonb_build_object('deleted',true);
  ELSIF p_action='renew' THEN
    IF c.creator IS DISTINCT FROM u OR c.partner IS NOT NULL
    THEN RAISE EXCEPTION 'Нельзя изменить чужое или принятое приглашение'; END IF;
    invite:=replace(gen_random_uuid()::text,'-','')||
            replace(gen_random_uuid()::text,'-','');
    UPDATE zags.couples SET
      invite_hash=encode(sha256(convert_to(invite,'UTF8')),'hex'),
      expires_at=now()+interval '7 days'
    WHERE id=raw_id;
    RETURN jsonb_build_object('id',raw_id,'token',invite);
  ELSIF p_action<>'get' THEN
    RAISE EXCEPTION 'Это действие временно недоступно';
  END IF;

  IF c.creator IS DISTINCT FROM u AND c.partner IS DISTINCT FROM u
  THEN RAISE EXCEPTION 'Нет доступа к чужому заявлению'; END IF;

  RETURN (to_jsonb(c)-array[
      'creator','partner','invite_hash','order_id','payment_id',
      'payment_url','payment_created_at'
    ]) || jsonb_build_object(
      'role',CASE WHEN c.creator=u THEN 1 ELSE 2 END,
      'has_partner',c.partner IS NOT NULL
    );
END $function$;


-- This is the first and only public-facing API authorization grant.
-- JWT identity AND server-side tester allowlist are required in the function.
REVOKE ALL ON FUNCTION public.zags_v2_action(text,jsonb)
 FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.zags_v2_action(text,jsonb)
 TO authenticated,service_role;
COMMENT ON FUNCTION public.zags_v2_action(text,jsonb) IS
 'Beget invitation beta. Authenticated users are denied unless server-side allowlisted. Zero users by default.';
COMMIT;
