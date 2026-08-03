-- TEST-ONLY shim. Never applied in prod (not under supabase/migrations/,
-- and scripts/db_test.sh is the only thing that runs it).
--
-- Supabase provides a real `auth.uid()` in prod, backed by its own auth
-- schema/JWT verification. Locally, against a bare postgres:16 container,
-- neither exists -- this file fakes just enough of that surface for
-- supabase/migrations/0002_rls.sql's policies to evaluate:
--   1. an `auth` schema + `auth.uid()` function, reading the same GUC
--      Supabase's PostgREST sets per-request (`request.jwt.claim.sub`);
--   2. a non-superuser `app_user` role that the RLS test suite connects as
--      (table owners bypass RLS entirely, so seeding must happen as the
--      superuser/owner and enforcement must be tested as someone else).

create extension if not exists pgcrypto;

create schema if not exists auth;

create or replace function auth.uid()
returns uuid
language sql
stable
as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

-- app_user: the role RLS assertions run as. NOT the table owner (whichever
-- role scripts/db_test.sh connects as to run the migrations), so it is
-- actually subject to RLS instead of bypassing it.
do $$
begin
    if not exists (select 1 from pg_roles where rolname = 'app_user') then
        create role app_user with login nosuperuser noinherit;
    end if;
end
$$;

-- Callers use this instead of poking the GUC directly, mirroring how a real
-- request carries a JWT `sub` claim. `set_config(..., false)` (not
-- is_local=true) so the setting survives across the multiple statements a
-- psycopg connection issues within one "logged in as this user" test block,
-- not just a single transaction.
create or replace function test_login_as(p_auth_user_id uuid)
returns void
language sql
as $$
    select set_config('request.jwt.claim.sub', p_auth_user_id::text, false)
$$;

create or replace function test_logout()
returns void
language sql
as $$
    select set_config('request.jwt.claim.sub', '', false)
$$;

grant execute on function test_login_as(uuid) to app_user;
grant execute on function test_logout() to app_user;
grant usage on schema auth to app_user;
grant execute on function auth.uid() to app_user;
grant usage on schema public to app_user;

-- NOTE: table-level grants (select/insert/update on person, observation,
-- etc.) for app_user are NOT set here -- this file runs before
-- supabase/migrations/*.sql, so those tables don't exist yet. See
-- scripts/db_test.sh, which grants on the tables right after the schema
-- migration applies, and again after each re-apply. RLS policies (in
-- 0002_rls.sql) are the actual access-control layer; these GRANTs are the
-- baseline SQL-privilege prerequisite RLS filters on top of -- app_user
-- still gets zero rows / a denied write for anything a policy doesn't
-- allow.
