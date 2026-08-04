-- TEST-ONLY shim. Never applied in prod (not under supabase/migrations/,
-- and scripts/db_test.sh is the only thing that runs it).
--
-- Supabase provides a real `auth.uid()` and pre-created `authenticated` role
-- in prod, backed by its own auth schema/JWT verification. Locally, against
-- a bare postgres:16 container, none of that exists -- this file fakes just
-- enough of that surface for supabase/migrations/0002_rls.sql's policies
-- (and 0003_grants.sql's grants) to evaluate:
--   1. an `auth` schema + `auth.uid()` function, reading either GUC form
--      Supabase's stack actually sets (`request.jwt.claim.sub` flat, or the
--      `request.jwt.claims` JSON blob PostgREST sets per-request);
--   2. a non-superuser `app_user` role + custom `test_login_as()` helper
--      that tests/db/test_rls.py connects as (table owners bypass RLS
--      entirely, so seeding must happen as the superuser/owner and
--      enforcement must be tested as someone else);
--   3. an `authenticated` role (NOLOGIN, matching real Supabase) that
--      tests/db/test_rls_authenticated.py exercises the REAL way Supabase
--      invokes RLS: `SET ROLE authenticated` + the `request.jwt.claims` GUC,
--      no custom test helper involved.

create extension if not exists pgcrypto;

create schema if not exists auth;

-- auth.uid() reads BOTH forms Supabase's stack actually sets, matching real
-- Supabase semantics (not just our own custom shim function below):
--   1. `request.jwt.claim.sub` -- a flat per-claim GUC, which is what this
--      repo's OWN test-only `test_login_as()`/`test_logout()` helpers set
--      (see below) -- kept so tests/db/test_rls.py (app_user + the custom
--      helpers) keeps working unchanged.
--   2. `request.jwt.claims` -- the single JSON-blob GUC PostgREST actually
--      sets per-request in real Supabase (`{"sub": "...", "role":
--      "authenticated", ...}`), and what tests/db/test_rls_authenticated.py
--      sets directly via `SET ROLE authenticated` + `set_config(...)` to
--      exercise the real mechanism end to end.
-- The flat form is checked first (nullif(...,'') so an empty/unset GUC falls
-- through) so existing app_user-based tests are unaffected either way.
create or replace function auth.uid()
returns uuid
language sql
stable
as $$
    select coalesce(
        nullif(current_setting('request.jwt.claim.sub', true), ''),
        nullif(current_setting('request.jwt.claims', true), '')::jsonb->>'sub'
    )::uuid
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

-- authenticated: real Supabase pre-creates this role (NOLOGIN -- PostgREST
-- connects as a separate privileged role and `SET ROLE authenticated` into
-- it per request; nothing ever logs in as `authenticated` directly). A bare
-- local postgres:16 container has no such role, so create it here -- this is
-- the ONE thing supabase/migrations/0003_grants.sql needs to already exist
-- before it can grant table access to it (see scripts/db_test.sh's apply
-- order: this shim runs before any supabase/migrations/*.sql).
do $$
begin
    if not exists (select 1 from pg_roles where rolname = 'authenticated') then
        create role authenticated nologin noinherit;
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

-- authenticated needs the same access to this fake `auth` schema that real
-- Supabase's `authenticated` role has to the real one -- it's what
-- tests/db/test_rls_authenticated.py's `SET ROLE authenticated` sessions
-- call (directly, and indirectly via 0002_rls.sql's SECURITY DEFINER
-- app_caller_*() helpers, though those run as their owner and wouldn't
-- strictly need this). Table-level grants for `authenticated` are NOT set
-- here -- those are real product grants and belong in
-- supabase/migrations/0003_grants.sql (applied after this shim, once the
-- tables exist), not in this test-only file.
grant usage on schema auth to authenticated;
grant execute on function auth.uid() to authenticated;

-- NOTE: table-level grants (select/insert/update on person, observation,
-- etc.) for app_user are NOT set here -- this file runs before
-- supabase/migrations/*.sql, so those tables don't exist yet. See
-- scripts/db_test.sh, which grants on the tables right after the schema
-- migration applies, and again after each re-apply. RLS policies (in
-- 0002_rls.sql) are the actual access-control layer; these GRANTs are the
-- baseline SQL-privilege prerequisite RLS filters on top of -- app_user
-- still gets zero rows / a denied write for anything a policy doesn't
-- allow. `authenticated`'s equivalent table grants come from
-- supabase/migrations/0003_grants.sql instead (see that file).
