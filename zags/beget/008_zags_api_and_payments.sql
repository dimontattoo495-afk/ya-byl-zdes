-- Bring the Beget ZAGS API to parity with the public ZAGS site.
-- Additive to the isolated zags schema; does not touch TATTOO PRICE tables.
BEGIN;

DO $guard$
BEGIN
  IF to_regclass('zags.couples') IS NULL OR to_regclass('zags.wishes') IS NULL THEN
    RAISE EXCEPTION 'Expected the installed zags.couples and zags.wishes tables';
  END IF;
  IF to_regclass('auth.users') IS NULL THEN
    RAISE EXCEPTION 'Supabase Auth is missing';
  END IF;
  IF to_regprocedure('public.zags_v2_action(text,jsonb)') IS NULL THEN
    RAISE EXCEPTION 'Expected the existing Beget ZAGS API before upgrading it';
  END IF;
  IF EXISTS (
    SELECT 1 FROM zags.wishes GROUP BY couple_id, author HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Duplicate wishes exist; review them before installing the unique wish constraint';
  END IF;
END
$guard$;

ALTER TABLE zags.couples
  ADD COLUMN IF NOT EXISTS news1 boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS news2 boolean NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS zags_wishes_one_per_author
  ON zags.wishes (couple_id, author);

CREATE OR REPLACE FUNCTION public.zags_v2_action(p_action text, p_data jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_user uuid := auth.uid();
  c zags.couples%ROWTYPE;
  tok text;
  cid uuid;
  result jsonb;
  public_ok boolean;
BEGIN
  IF p_action NOT IN ('public','invitation') AND v_user IS NULL THEN
    RAISE EXCEPTION 'Войдите в аккаунт';
  END IF;

  IF p_action = 'list' THEN
    RETURN coalesce((
      SELECT jsonb_agg(jsonb_build_object('id',id,'family',family,'married_at',married_at) ORDER BY created_at DESC)
      FROM zags.couples WHERE creator=v_user OR partner=v_user
    ), '[]'::jsonb);
  END IF;

  IF p_action = 'create' THEN
    PERFORM pg_advisory_xact_lock(hashtextextended(v_user::text,0));
    IF (SELECT count(*) FROM zags.couples WHERE creator=v_user AND created_at>now()-interval '1 day') >= 5 THEN
      RAISE EXCEPTION 'Можно создать до 5 заявлений в день';
    END IF;
    IF coalesce((p_data->>'consent')::boolean,false) IS NOT TRUE THEN
      RAISE EXCEPTION 'Подтвердите согласие';
    END IF;
    IF coalesce(p_data->>'plan','') NOT IN ('basic','beautiful','party') THEN
      RAISE EXCEPTION 'Выберите тариф';
    END IF;
    IF length(btrim(coalesce(p_data->>'name1',''))) NOT BETWEEN 1 AND 80
       OR length(btrim(coalesce(p_data->>'name2',''))) NOT BETWEEN 1 AND 80
       OR length(btrim(coalesce(p_data->>'family',''))) NOT BETWEEN 1 AND 100 THEN
      RAISE EXCEPTION 'Проверьте имена и название истории';
    END IF;
    tok := replace(gen_random_uuid()::text,'-','') || replace(gen_random_uuid()::text,'-','');
    INSERT INTO zags.couples (
      creator,name1,name2,family,plan,theme,invite_hash,expires_at,scheduled_at,vow1,
      payment_status,share1,share2,news1,news2
    ) VALUES (
      v_user,btrim(p_data->>'name1'),btrim(p_data->>'name2'),btrim(p_data->>'family'),p_data->>'plan',
      CASE WHEN p_data->>'plan'='basic' THEN 'rose' ELSE coalesce(p_data->>'theme','rose') END,
      encode(sha256(convert_to(tok,'UTF8')),'hex'),now()+interval '7 days',
      nullif(p_data->>'scheduled_at','')::timestamptz,
      CASE WHEN p_data->>'plan'='basic' THEN '' ELSE left(coalesce(p_data->>'vow',''),1000) END,
      'unpaid',false,false,false,false
    ) RETURNING * INTO c;
    RETURN jsonb_build_object('id',c.id,'token',tok);
  END IF;

  cid := (p_data->>'id')::uuid;
  SELECT * INTO c FROM zags.couples WHERE id=cid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Страница не найдена'; END IF;
  public_ok := c.share1 AND c.share2 AND c.payment_status='paid'
    AND (c.married_at IS NOT NULL OR c.plan='party');

  IF p_action='invitation' THEN
    IF c.partner IS NOT NULL OR c.expires_at < now()
       OR c.invite_hash <> encode(sha256(convert_to(coalesce(p_data->>'token',''),'UTF8')),'hex') THEN
      RAISE EXCEPTION 'Приглашение уже принято или срок истёк';
    END IF;
    RETURN jsonb_build_object('id',c.id,'name1',c.name1,'name2',c.name2,'family',c.family,
      'plan',c.plan,'scheduled_at',c.scheduled_at);
  ELSIF p_action='accept' THEN
    IF c.creator=v_user THEN RAISE EXCEPTION 'Партнёр должен войти со своего аккаунта'; END IF;
    IF c.partner IS NOT NULL OR c.expires_at < now()
       OR c.invite_hash <> encode(sha256(convert_to(coalesce(p_data->>'token',''),'UTF8')),'hex') THEN
      RAISE EXCEPTION 'Приглашение недействительно';
    END IF;
    IF coalesce((p_data->>'consent')::boolean,false) IS NOT TRUE THEN
      RAISE EXCEPTION 'Подтвердите согласие';
    END IF;
    IF length(btrim(coalesce(p_data->>'name',''))) NOT BETWEEN 1 AND 80 THEN
      RAISE EXCEPTION 'Укажите имя';
    END IF;
    UPDATE zags.couples SET partner=v_user,accepted_at=now(),name2=btrim(p_data->>'name'),
      vow2=CASE WHEN plan='basic' THEN '' ELSE left(coalesce(p_data->>'vow',''),1000) END
      WHERE id=cid RETURNING * INTO c;
  ELSIF p_action='cancel' THEN
    IF c.creator IS DISTINCT FROM v_user OR c.partner IS NOT NULL OR c.accepted_at IS NOT NULL
       OR coalesce(c.payment_status,'unpaid') <> 'unpaid' OR c.payment_id IS NOT NULL
       OR c.order_id IS NOT NULL OR c.married_at IS NOT NULL THEN
      RAISE EXCEPTION 'Нельзя отменить принятое или связанное с оплатой заявление';
    END IF;
    DELETE FROM zags.couples WHERE id=cid AND creator=v_user;
    RETURN 'true'::jsonb;
  ELSIF p_action='public' THEN
    IF NOT public_ok THEN RAISE EXCEPTION 'Страница закрыта или пока не опубликована'; END IF;
  ELSIF p_action='wish' THEN
    IF NOT public_ok OR c.plan <> 'party' THEN RAISE EXCEPTION 'Поздравления недоступны'; END IF;
    IF length(btrim(coalesce(p_data->>'name',''))) NOT BETWEEN 1 AND 80
       OR length(btrim(coalesce(p_data->>'message',''))) NOT BETWEEN 1 AND 1000 THEN
      RAISE EXCEPTION 'Проверьте имя и текст поздравления';
    END IF;
    INSERT INTO zags.wishes(couple_id,author,name,message)
      VALUES(cid,v_user,btrim(p_data->>'name'),btrim(p_data->>'message'))
      ON CONFLICT(couple_id,author) DO UPDATE SET name=excluded.name,message=excluded.message;
  ELSIF c.creator=v_user OR c.partner=v_user THEN
    IF p_action='yes' THEN
      IF c.payment_status<>'paid' OR c.partner IS NULL THEN
        RAISE EXCEPTION 'Сначала требуется согласие партнёра и подтверждённая оплата';
      END IF;
      IF c.scheduled_at IS NOT NULL AND c.scheduled_at>now() THEN RAISE EXCEPTION 'Церемония ещё не началась'; END IF;
      UPDATE zags.couples SET
        yes1=CASE WHEN creator=v_user THEN coalesce(yes1,now()) ELSE yes1 END,
        yes2=CASE WHEN partner=v_user THEN coalesce(yes2,now()) ELSE yes2 END
        WHERE id=cid RETURNING * INTO c;
      IF c.yes1 IS NOT NULL AND c.yes2 IS NOT NULL THEN
        UPDATE zags.couples SET married_at=coalesce(married_at,now()) WHERE id=cid RETURNING * INTO c;
      END IF;
    ELSIF p_action='share' THEN
      IF p_data->>'value' NOT IN ('true','false') THEN RAISE EXCEPTION 'Неверное значение согласия'; END IF;
      UPDATE zags.couples SET
        share1=CASE WHEN creator=v_user THEN (p_data->>'value')::boolean ELSE share1 END,
        share2=CASE WHEN partner=v_user THEN (p_data->>'value')::boolean ELSE share2 END
        WHERE id=cid RETURNING * INTO c;
    ELSIF p_action='photo' THEN
      IF c.plan='basic' THEN RAISE EXCEPTION 'Фото доступно в тарифах 299 и 499 ₽'; END IF;
      IF length(coalesce(p_data->>'photo','')) > 7000000 THEN RAISE EXCEPTION 'Фото слишком большое'; END IF;
      IF coalesce(p_data->>'photo','')<>'' AND p_data->>'photo' !~ '^data:image/jpeg;base64,[A-Za-z0-9+/=]+$' THEN
        RAISE EXCEPTION 'Нужен файл JPEG';
      END IF;
      UPDATE zags.couples SET photo=coalesce(p_data->>'photo',''),share1=false,share2=false
        WHERE id=cid RETURNING * INTO c;
    ELSIF p_action='renew' THEN
      IF c.creator<>v_user OR c.partner IS NOT NULL OR c.payment_status<>'unpaid' THEN
        RAISE EXCEPTION 'Нельзя обновить приглашение';
      END IF;
      tok := replace(gen_random_uuid()::text,'-','') || replace(gen_random_uuid()::text,'-','');
      UPDATE zags.couples SET invite_hash=encode(sha256(convert_to(tok,'UTF8')),'hex'),
        expires_at=now()+interval '7 days' WHERE id=cid;
      RETURN jsonb_build_object('id',cid,'token',tok);
    ELSIF p_action='delete_wish' THEN
      DELETE FROM zags.wishes WHERE couple_id=cid AND id=(p_data->>'wish_id')::uuid;
    ELSIF p_action<>'get' THEN
      RAISE EXCEPTION 'Неизвестное действие';
    END IF;
  ELSE
    RAISE EXCEPTION 'Нет доступа';
  END IF;

  SELECT * INTO c FROM zags.couples WHERE id=cid;
  result := to_jsonb(c)-ARRAY['invite_hash','creator','partner','payment_id','payment_url','order_id'];
  IF p_action IN ('public','wish') THEN
    result := result-ARRAY['payment_created_at','expires_at','yes1','yes2','accepted_at','share1','share2'];
  ELSE
    result := result || jsonb_build_object('role',CASE WHEN c.creator=v_user THEN 1 ELSE 2 END,
      'has_partner',c.partner IS NOT NULL);
  END IF;
  IF c.plan='party' THEN
    result := result || jsonb_build_object('wishes',coalesce((
      SELECT jsonb_agg(to_jsonb(w)-ARRAY['author','couple_id'] ORDER BY w.created_at)
      FROM zags.wishes AS w WHERE w.couple_id=cid
    ),'[]'::jsonb));
  END IF;
  RETURN result;
END
$function$;

CREATE OR REPLACE FUNCTION public.zags_news_status(p_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $function$
DECLARE v_user uuid:=auth.uid(); c zags.couples%ROWTYPE;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Войдите в аккаунт'; END IF;
  SELECT * INTO c FROM zags.couples WHERE id=p_id AND (creator=v_user OR partner=v_user);
  IF NOT FOUND THEN RAISE EXCEPTION 'Нет доступа'; END IF;
  RETURN jsonb_build_object('mine',CASE WHEN c.creator=v_user THEN c.news1 ELSE c.news2 END,
    'both',c.news1 AND c.news2);
END
$function$;

CREATE OR REPLACE FUNCTION public.zags_set_news_consent(p_id uuid,p_consent boolean)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
DECLARE v_user uuid:=auth.uid();
BEGIN
  IF v_user IS NULL OR p_consent IS NULL THEN RAISE EXCEPTION 'Войдите в аккаунт и укажите согласие'; END IF;
  UPDATE zags.couples SET
    news1=CASE WHEN creator=v_user THEN p_consent ELSE news1 END,
    news2=CASE WHEN partner=v_user THEN p_consent ELSE news2 END
    WHERE id=p_id AND (creator=v_user OR partner=v_user) AND partner IS NOT NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Заявление не найдено или нет доступа'; END IF;
  RETURN true;
END
$function$;

CREATE OR REPLACE FUNCTION public.zags_public_news()
RETURNS TABLE(couple_id uuid,first_name text,second_name text,celebrated_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $function$
  SELECT c.id,c.name1,c.name2,c.married_at FROM zags.couples AS c
  WHERE c.news1 IS TRUE AND c.news2 IS TRUE AND c.partner IS NOT NULL
    AND c.payment_status='paid' AND c.married_at IS NOT NULL
  ORDER BY c.married_at DESC LIMIT 10
$function$;

CREATE OR REPLACE FUNCTION public.zags_cancel_unaccepted(p_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
BEGIN
  RETURN public.zags_v2_action('cancel',jsonb_build_object('id',p_id)) = 'true'::jsonb;
END
$function$;

CREATE OR REPLACE FUNCTION public.zags_payment(p_action text,p_data jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
DECLARE c zags.couples%ROWTYPE; amount integer; fresh boolean:=false;
BEGIN
  IF p_action='lookup' THEN
    SELECT * INTO c FROM zags.couples WHERE order_id=(p_data->>'order_id')::uuid;
    IF NOT FOUND THEN RAISE EXCEPTION 'Заказ не найден'; END IF;
    RETURN jsonb_build_object('id',c.id);
  END IF;
  SELECT * INTO c FROM zags.couples WHERE id=(p_data->>'id')::uuid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Заявление не найдено'; END IF;
  amount := CASE c.plan WHEN 'basic' THEN 14900 WHEN 'beautiful' THEN 29900 ELSE 49900 END;
  IF c.plan NOT IN ('basic','beautiful','party') THEN RAISE EXCEPTION 'Неизвестный тариф'; END IF;
  IF p_action='claim' THEN
    IF (p_data->>'user_id')::uuid NOT IN (c.creator,coalesce(c.partner,c.creator)) OR c.partner IS NULL THEN
      RAISE EXCEPTION 'Нет доступа или партнёр ещё не принял приглашение';
    END IF;
    IF c.payment_status IN ('paid','refunded') THEN RAISE EXCEPTION 'Оплата уже завершена'; END IF;
    IF c.order_id IS NULL THEN
      UPDATE zags.couples SET order_id=gen_random_uuid(),payment_status='pending',payment_created_at=now()
        WHERE id=c.id RETURNING * INTO c;
      fresh:=true;
    END IF;
  ELSIF p_action='attach' THEN
    IF c.order_id::text IS DISTINCT FROM p_data->>'order_id' THEN RAISE EXCEPTION 'Неверный заказ'; END IF;
    UPDATE zags.couples SET payment_id=p_data->>'payment_id',payment_url=p_data->>'url'
      WHERE id=c.id AND payment_id IS NULL RETURNING * INTO c;
  ELSIF p_action='settle' THEN
    IF c.order_id::text IS DISTINCT FROM p_data->>'order_id'
       OR c.payment_id IS DISTINCT FROM p_data->>'payment_id'
       OR amount IS DISTINCT FROM (p_data->>'amount')::integer THEN
      RAISE EXCEPTION 'Параметры платежа не совпадают';
    END IF;
    IF p_data->>'status'='CONFIRMED' AND c.payment_status<>'refunded' THEN
      UPDATE zags.couples SET payment_status='paid' WHERE id=c.id RETURNING * INTO c;
    ELSIF p_data->>'status' IN ('REFUNDED','PARTIAL_REFUNDED','REVERSED') THEN
      UPDATE zags.couples SET payment_status='refunded',share1=false,share2=false
        WHERE id=c.id RETURNING * INTO c;
    END IF;
  ELSIF p_action<>'get' THEN
    RAISE EXCEPTION 'Неизвестное действие';
  END IF;
  RETURN to_jsonb(c)||jsonb_build_object('amount',amount,'fresh',fresh);
END
$function$;

REVOKE ALL ON FUNCTION public.zags_v2_action(text,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.zags_v2_action(text,jsonb) TO authenticated;
REVOKE ALL ON FUNCTION public.zags_news_status(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.zags_news_status(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.zags_set_news_consent(uuid,boolean) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.zags_set_news_consent(uuid,boolean) TO authenticated;
REVOKE ALL ON FUNCTION public.zags_public_news() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.zags_public_news() TO anon,authenticated;
REVOKE ALL ON FUNCTION public.zags_cancel_unaccepted(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.zags_cancel_unaccepted(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.zags_payment(text,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.zags_payment(text,jsonb) TO service_role;

COMMENT ON FUNCTION public.zags_v2_action(text,jsonb) IS 'Authenticated ZAGS application API using the isolated Beget zags schema.';
COMMENT ON FUNCTION public.zags_payment(text,jsonb) IS 'Server-only payment state API; callable only by service_role.';

COMMIT;
