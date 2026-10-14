-- Read-only health checks for "Я БЫЛ ЗДЕСЬ" / "Виртуальный ЗАГС"
-- Safe to run with Supabase SQL Editor. Does not read user messages or tokens.
-- Expected: all alert counters = 0.
SELECT
  count(*) FILTER (WHERE NOT is_demo AND status='published' AND payment_status<>'paid') AS unpaid_public_entries,
  count(*) FILTER (WHERE payment_status='refunded' AND status='published') AS refunded_public_entries,
  count(*) FILTER (WHERE NOT is_demo AND status='published' AND payment_status='paid') AS verified_public_entries
FROM public.ybz_entries;

SELECT
  count(*) FILTER (WHERE p.status='refunded' AND (e.status='published' OR e.payment_status<>'refunded')) AS refund_entry_mismatches,
  count(*) FILTER (WHERE p.status='succeeded' AND e.payment_status='refunded') AS payment_refund_mismatches
FROM public.ybz_payments p JOIN public.ybz_entries e ON e.id=p.entry_id;

SELECT
  p.proname AS admin_function,
  has_function_privilege('anon',p.oid,'EXECUTE') AS anonymous_execute_allowed
FROM pg_proc p
JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND (p.proname LIKE 'ybz_admin_%' OR p.proname='ybz_is_admin')
ORDER BY p.proname;

SELECT conname,convalidated
FROM pg_constraint
WHERE conrelid='public.ybz_entries'::regclass AND conname='ybz_published_requires_payment';

SELECT tgname,tgenabled FROM pg_trigger
WHERE tgrelid IN ('public.ybz_entries'::regclass,'public.ybz_payments'::regclass)
AND tgname IN ('ybz_guard_entry_publication_trg','ybz_guard_payment_refund_trg');
