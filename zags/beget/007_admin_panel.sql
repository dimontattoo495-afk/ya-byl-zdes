-- Add a read-only ZAGS admin API on the existing Beget database.
-- Apply only after the isolated zags schema is already installed.
-- No TATTOO PRICE tables or shared Auth settings are changed.
BEGIN;

DO $guard$
BEGIN
  IF to_regclass('zags.couples') IS NULL THEN
    RAISE EXCEPTION 'Missing zags.couples; install the isolated ZAGS schema first';
  END IF;
  IF to_regclass('auth.users') IS NULL THEN
    RAISE EXCEPTION 'Missing Supabase Auth; refusing to install admin roles';
  END IF;
END
$guard$;

CREATE TABLE IF NOT EXISTS zags.admins (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE zags.admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE zags.admins FORCE ROW LEVEL SECURITY;
REVOKE ALL ON zags.admins FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON zags.admins TO service_role;

CREATE OR REPLACE FUNCTION public.zags_admin_is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT auth.uid() IS NOT NULL
     AND EXISTS (
       SELECT 1
       FROM zags.admins AS a
       WHERE a.user_id = auth.uid()
     );
$function$;

CREATE OR REPLACE FUNCTION public.zags_admin_summary_v1()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM zags.admins AS a WHERE a.user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Доступ только для администратора ЗАГСа';
  END IF;

  RETURN (
    SELECT jsonb_build_object(
      'total', count(*),
      'pending_partner', count(*) FILTER (WHERE c.partner IS NULL),
      'accepted', count(*) FILTER (WHERE c.accepted_at IS NOT NULL),
      'married', count(*) FILTER (WHERE c.married_at IS NOT NULL),
      'paid', count(*) FILTER (WHERE c.payment_status = 'paid'),
      'payment_pending', count(*) FILTER (WHERE c.payment_status = 'pending')
    )
    FROM zags.couples AS c
  );
END
$function$;

CREATE OR REPLACE FUNCTION public.zags_admin_couples_v1(
  p_search text DEFAULT '',
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  name1 text,
  name2 text,
  family text,
  plan text,
  payment_status text,
  accepted_at timestamptz,
  married_at timestamptz,
  created_at timestamptz,
  scheduled_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  needle text := left(btrim(coalesce(p_search, '')), 100);
  row_limit integer := least(greatest(coalesce(p_limit, 50), 1), 100);
  row_offset integer := least(greatest(coalesce(p_offset, 0), 0), 100000);
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM zags.admins AS a WHERE a.user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Доступ только для администратора ЗАГСа';
  END IF;

  RETURN QUERY
    SELECT c.id, c.name1, c.name2, c.family, c.plan, c.payment_status,
           c.accepted_at, c.married_at, c.created_at, c.scheduled_at
    FROM zags.couples AS c
    WHERE needle = ''
       OR c.family ILIKE '%' || needle || '%'
       OR c.name1 ILIKE '%' || needle || '%'
       OR c.name2 ILIKE '%' || needle || '%'
       OR c.id::text = needle
    ORDER BY c.created_at DESC
    LIMIT row_limit OFFSET row_offset;
END
$function$;

REVOKE ALL ON FUNCTION public.zags_admin_is_admin()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.zags_admin_summary_v1()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.zags_admin_couples_v1(text, integer, integer)
  FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.zags_admin_is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.zags_admin_summary_v1() TO authenticated;
GRANT EXECUTE ON FUNCTION public.zags_admin_couples_v1(text, integer, integer) TO authenticated;

COMMENT ON TABLE zags.admins IS
  'ZAGS-only admin allowlist. Separate from shared TATTOO PRICE Auth roles.';
COMMENT ON FUNCTION public.zags_admin_is_admin() IS
  'Checks the current authenticated Beget user against the ZAGS-only admin allowlist.';
COMMENT ON FUNCTION public.zags_admin_summary_v1() IS
  'Read-only ZAGS overview; requires membership in zags.admins.';
COMMENT ON FUNCTION public.zags_admin_couples_v1(text, integer, integer) IS
  'Read-only, paginated ZAGS application list; omits invite secrets, vows, photos and Auth identifiers.';

COMMIT;
