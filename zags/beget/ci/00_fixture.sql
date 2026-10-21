-- CI ONLY: ephemeral PostgreSQL, fake Supabase roles and fake user table.
-- Never run this file on any real Supabase installation or VPS.
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;
CREATE SCHEMA auth;
CREATE TABLE auth.users(id uuid PRIMARY KEY);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
$auth_uid$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $auth_uid$;
-- Sentinel table simulates a pre-existing TATTOO PRICE table, must stay intact.
CREATE TABLE public.tp_listings(id uuid PRIMARY KEY, title text NOT NULL);
INSERT INTO public.tp_listings VALUES
('99999999-9999-4999-8999-999999999999','TATTOO PRICE MUST NOT CHANGE');
