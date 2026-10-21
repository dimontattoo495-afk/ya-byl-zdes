-- VIRTUAL ZAGS — BEGET / SELF-HOSTED SUPABASE
-- DRAFT ONLY. NEVER RUN AUTOMATICALLY ON THE LIVE VPS.
-- Transactional, fail-closed setup of an isolated data schema (NO migrations/data import).
-- Requirements: PostgreSQL 17, Supabase auth.users, anon/authenticated/service_role.
-- Does not alter pre-existing schemas/tables, including the 14 tp_* TATTOO PRICE tables.
BEGIN;
DO $guard$
BEGIN
 IF to_regnamespace('zags') IS NOT NULL THEN
   RAISE EXCEPTION 'Refusing to overwrite existing zags schema';
 END IF;
 IF to_regclass('auth.users') IS NULL THEN
   RAISE EXCEPTION 'Supabase auth.users is absent; cannot migrate user relationships safely';
 END IF;
 IF EXISTS (
   SELECT 1 FROM (VALUES ('anon'),('authenticated'),('service_role')) AS wanted(role_name)
   WHERE NOT EXISTS (SELECT 1 FROM pg_roles p WHERE p.rolname=wanted.role_name)
 ) THEN RAISE EXCEPTION 'Self-hosted Supabase roles are missing'; END IF;
END $guard$;

CREATE SCHEMA zags;
REVOKE ALL ON SCHEMA zags FROM PUBLIC;
REVOKE ALL ON SCHEMA zags FROM anon, authenticated;

CREATE TABLE zags.couples (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 creator uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
 partner uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
 name1 text NOT NULL CHECK(length(name1) BETWEEN 1 AND 60 AND btrim(name1)<>''),
 name2 text NOT NULL CHECK(length(name2) BETWEEN 1 AND 60 AND btrim(name2)<>''),
 family text NOT NULL CHECK(length(family) BETWEEN 1 AND 80 AND btrim(family)<>''),
 plan text NOT NULL CHECK(plan IN ('basic','beautiful','party')),
 theme text NOT NULL DEFAULT 'rose' CHECK(theme IN ('rose','ivory','night')),
 invite_hash text NOT NULL CHECK(invite_hash ~ '^[0-9a-f]{64}$'),
 expires_at timestamptz NOT NULL DEFAULT now() + interval '7 days',
 scheduled_at timestamptz,
 accepted_at timestamptz,
 yes1 timestamptz,
 yes2 timestamptz,
 married_at timestamptz,
 vow1 text NOT NULL DEFAULT '' CHECK(length(vow1)<=500),
 vow2 text NOT NULL DEFAULT '' CHECK(length(vow2)<=500),
 photo text NOT NULL DEFAULT '' CHECK(octet_length(photo)<=400000),
 share1 boolean NOT NULL DEFAULT false,
 share2 boolean NOT NULL DEFAULT false,
 news1 boolean NOT NULL DEFAULT false,
 news2 boolean NOT NULL DEFAULT false,
 payment_status text NOT NULL DEFAULT 'unpaid'
   CHECK(payment_status IN ('unpaid','pending','paid','refunded')),
 order_id uuid UNIQUE,
 payment_id text UNIQUE,
 payment_url text,
 payment_created_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT zags_distinct_participants CHECK(partner IS NULL OR creator<>partner),
 CONSTRAINT zags_requires_both_yes CHECK(married_at IS NULL OR (yes1 IS NOT NULL AND yes2 IS NOT NULL)),
 CONSTRAINT zags_paid_requires_partner CHECK(payment_status NOT IN ('paid','refunded') OR partner IS NOT NULL)
);
CREATE INDEX couples_creator_created ON zags.couples(creator,created_at DESC);
CREATE INDEX couples_partner_created ON zags.couples(partner,created_at DESC);
CREATE INDEX couples_expires ON zags.couples(expires_at) WHERE partner IS NULL;

CREATE TABLE zags.wishes (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 couple_id uuid NOT NULL REFERENCES zags.couples(id) ON DELETE CASCADE,
 author uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
 name text NOT NULL CHECK(length(name) BETWEEN 1 AND 60 AND btrim(name)<>''),
 message text NOT NULL CHECK(length(message) BETWEEN 1 AND 400 AND btrim(message)<>''),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(couple_id,author)
);
CREATE INDEX wishes_couple_created ON zags.wishes(couple_id,created_at);

-- No publicly accessible policies: participants will operate ONLY through
-- separate, strictly authorized RPCs in a later reviewed migration.
ALTER TABLE zags.couples ENABLE ROW LEVEL SECURITY;
ALTER TABLE zags.wishes ENABLE ROW LEVEL SECURITY;
ALTER TABLE zags.couples FORCE ROW LEVEL SECURITY;
ALTER TABLE zags.wishes FORCE ROW LEVEL SECURITY;

REVOKE ALL ON ALL TABLES IN SCHEMA zags FROM PUBLIC,anon,authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA zags FROM PUBLIC,anon,authenticated;
GRANT USAGE ON SCHEMA zags TO service_role;
GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA zags TO service_role;

COMMENT ON SCHEMA zags IS
 'Private draft data space for virtual ZAGS. UI/RPC, authentication and migration are NOT enabled.';
COMMENT ON TABLE zags.couples IS
 'User PII. Isolated from TATTOO PRICE; never grant direct browser access.';
COMMIT;
