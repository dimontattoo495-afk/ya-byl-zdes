\set ON_ERROR_STOP on
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;
CREATE SCHEMA auth;
CREATE TABLE auth.users (id uuid PRIMARY KEY, email text UNIQUE, email_confirmed_at timestamptz);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
INSERT INTO auth.users(id,email,email_confirmed_at) VALUES
 ('00000000-0000-0000-0000-000000000001','owner@example.test',now()),
 ('00000000-0000-0000-0000-000000000002','user@example.test',now());
CREATE SCHEMA zags;
CREATE TABLE zags.couples (
 id uuid PRIMARY KEY,
 name1 text NOT NULL, name2 text NOT NULL, family text NOT NULL,
 plan text NOT NULL, payment_status text NOT NULL,
 accepted_at timestamptz, married_at timestamptz, created_at timestamptz NOT NULL, scheduled_at timestamptz,
 partner uuid, creator uuid
);
INSERT INTO zags.couples(id,name1,name2,family,plan,payment_status,accepted_at,married_at,created_at,scheduled_at,partner,creator) VALUES
 ('10000000-0000-0000-0000-000000000001','Аня','Илья','Аня и Илья','basic','paid',now(),now(),now(),NULL,'00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000001'),
 ('10000000-0000-0000-0000-000000000002','Маша','Павел','Маша и Павел','beautiful','unpaid',NULL,NULL,now(),NULL,NULL,'00000000-0000-0000-0000-000000000001');