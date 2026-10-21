-- Preparation only: does not enable payments or populate the allowlist.
-- Designed for one real 10 RUB checkout with the existing T-Bank acquiring terminal.
-- Do not apply until the bank's service-category permission and receipts are verified.
BEGIN;
ALTER TABLE public.zags_couples
  ADD COLUMN IF NOT EXISTS payment_amount_kopecks integer
  CONSTRAINT zags_couples_payment_amount_positive CHECK (payment_amount_kopecks IS NULL OR payment_amount_kopecks > 0);

CREATE TABLE IF NOT EXISTS public.zags_live_test_allowlist (
  couple_id uuid PRIMARY KEY REFERENCES public.zags_couples(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT false,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.zags_live_test_allowlist ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.zags_live_test_allowlist FROM PUBLIC, anon, authenticated;
-- No INSERT or UPDATE grant to browser users; controlled only by a project operator.

CREATE OR REPLACE FUNCTION public.zags_payment(p_action text, p_data jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
 c public.zags_couples;
 amount integer;
 fresh boolean := false;
BEGIN
 SELECT * INTO c FROM public.zags_couples
 WHERE id=(p_data->>'id')::uuid FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Заявление не найдено'; END IF;

 -- Persist the invoiced amount so an expiring test authorization cannot
 -- retroactively change the amount checked by GetState / webhook.
 amount := coalesce(
   c.payment_amount_kopecks,
   CASE WHEN c.order_id IS NULL
      AND EXISTS (
        SELECT 1 FROM public.zags_live_test_allowlist t
        WHERE t.couple_id=c.id AND t.enabled AND t.expires_at>now()
      )
     THEN 1000
     ELSE CASE c.plan WHEN 'basic' THEN 14900 WHEN 'beautiful' THEN 29900 ELSE 49900 END
   END
 );

 IF p_action='claim' THEN
   IF (p_data->>'user_id')::uuid NOT IN (c.creator,coalesce(c.partner,c.creator)) THEN
     RAISE EXCEPTION 'Нет доступа';
   END IF;
   IF c.partner IS NULL THEN RAISE EXCEPTION 'Партнёр ещё не принял приглашение'; END IF;
   IF c.payment_status IN ('paid','refunded') THEN RAISE EXCEPTION 'Оплата уже завершена'; END IF;
   IF c.order_id IS NULL THEN
     UPDATE public.zags_couples SET
       order_id=gen_random_uuid(),
       payment_status='pending',
       payment_created_at=now(),
       payment_amount_kopecks=amount
     WHERE id=c.id RETURNING * INTO c;
     fresh:=true;
   END IF;
 ELSIF p_action='attach' THEN
   IF c.order_id::text IS DISTINCT FROM p_data->>'order_id' THEN
     RAISE EXCEPTION 'Неверный заказ';
   END IF;
   UPDATE public.zags_couples SET
       payment_id=p_data->>'payment_id', payment_url=p_data->>'url'
   WHERE id=c.id AND payment_id IS NULL RETURNING * INTO c;
 ELSIF p_action='settle' THEN
   IF c.order_id::text IS DISTINCT FROM p_data->>'order_id'
     OR c.payment_id IS DISTINCT FROM p_data->>'payment_id'
     OR amount IS DISTINCT FROM (p_data->>'amount')::integer
   THEN RAISE EXCEPTION 'Параметры платежа не совпадают'; END IF;
   IF p_data->>'status'='CONFIRMED' AND c.payment_status<>'refunded' THEN
     UPDATE public.zags_couples SET payment_status='paid'
       WHERE id=c.id RETURNING * INTO c;
   ELSIF p_data->>'status' IN ('REFUNDED','PARTIAL_REFUNDED','REVERSED') THEN
     UPDATE public.zags_couples SET
       payment_status='refunded', share1=false, share2=false
       WHERE id=c.id RETURNING * INTO c;
   END IF;
 ELSIF p_action<>'get' THEN RAISE EXCEPTION 'Неизвестное действие'; END IF;
 RETURN to_jsonb(c)||jsonb_build_object('amount',amount,'fresh',fresh);
END
$function$;

-- Preserve the existing service-role-only execution model.
REVOKE ALL ON FUNCTION public.zags_payment(text,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.zags_payment(text,jsonb) TO service_role;
COMMIT;